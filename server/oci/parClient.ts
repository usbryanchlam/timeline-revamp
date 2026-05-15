import { readFileSync } from 'fs';
import { createRequire } from 'node:module';
import { env } from '../env.js';

// Bridge for CJS-only OCI SDK packages. The server runs as ESM (tsx watch)
// where bare `require` is undefined. We can't use top-level `import` because
// loading the OCI SDK touches its native auth provider at module-eval time
// and trips tests that don't have OCI env vars. createRequire keeps the
// lazy/sync semantics buildRealClient relies on.
const cjsRequire = createRequire(import.meta.url);

// Dynamic import of sharp to avoid loading the native binary at module
// evaluation time in test environments where it may not be needed.
// Sharp is always loaded before makeThumbAndPut is called in production.
// Type-only import for TypeScript awareness.
type Sharp = typeof import('sharp');
let sharpModule: Sharp | null = null;
async function getSharp(): Promise<Sharp> {
  if (!sharpModule) {
    sharpModule = (await import('sharp')).default as unknown as Sharp;
  }
  return sharpModule;
}

// ─── OCI client interface ─────────────────────────────────────────────────
// The interface is the test seam: __setOciClientForTest injects a FAKE_OCI
// so integration tests never need real OCI credentials.
// makeThumbAndPut is a single composite function: download + sharp + PUT.
// This keeps the test boundary clean (one mock, not three separate mocks).
export interface OciClient {
  readonly createWritePar: (args: { objectName: string }) => Promise<{ uploadUrl: string }>;
  readonly getMasterBuffer: (objectKey: string) => Promise<Buffer>;
  readonly makeThumbAndPut: (masterBuffer: Buffer, thumbKey: string) => Promise<void>;
  readonly getPublicUrl: (objectKey: string) => string;
}

// ─── Test injection seam ──────────────────────────────────────────────────
let override: OciClient | null = null;

export function __setOciClientForTest(mock: OciClient): void {
  override = mock;
}

// ─── Real client (lazy-constructed) ──────────────────────────────────────
// Only constructed when env vars are present; never constructed during unit
// tests that set the override. Lazy construction means the test file can
// import from this module without OCI env vars set.
let realClient: OciClient | null = null;

function buildRealClient(): OciClient {
  // Synchronous CJS load via createRequire (server is ESM; bare require is
  // undefined here). Only called when real OCI credentials are present —
  // tests inject a mock via __setOciClientForTest before this ever runs.
  const objectStorage = cjsRequire('oci-objectstorage') as typeof import('oci-objectstorage');
  const common = cjsRequire('oci-common') as typeof import('oci-common');

  const tenancy = env.OCI_TENANCY_OCID!;
  const user = env.OCI_USER_OCID!;
  const fingerprint = env.OCI_FINGERPRINT!;
  const privateKeyPath = env.OCI_PRIVATE_KEY_PATH!;
  const region = env.OCI_REGION!;
  // Optional — only present when the PEM is passphrase-protected. SDK
  // signature: (tenancy, user, fingerprint, privateKey, passphrase, region).
  const passphrase = env.OCI_PRIVATE_KEY_PASSPHRASE ?? null;

  const privateKey = readFileSync(privateKeyPath, 'utf8');

  const provider = new common.SimpleAuthenticationDetailsProvider(
    tenancy,
    user,
    fingerprint,
    privateKey,
    passphrase,
    common.Region.fromRegionId(region),
  );

  const client = new objectStorage.ObjectStorageClient({
    authenticationDetailsProvider: provider,
  });

  return {
    async createWritePar({ objectName }) {
      const { AccessType } = objectStorage.models.CreatePreauthenticatedRequestDetails;
      const par = await client.createPreauthenticatedRequest({
        namespaceName: env.OCI_NAMESPACE!,
        bucketName: env.OCI_BUCKET_NAME!,
        createPreauthenticatedRequestDetails: {
          name: `upload-${objectName}`,
          objectName,
          accessType: AccessType.ObjectWrite,
          // 5-minute TTL — client must PUT within 5 minutes.
          timeExpires: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      // RESEARCH Pitfall 6: accessUri is returned ONCE — return immediately.
      // Do NOT try to retrieve it later; it's gone after this response.
      return {
        uploadUrl: `https://objectstorage.${env.OCI_REGION!}.oraclecloud.com${par.preauthenticatedRequest.accessUri}`,
      };
    },

    async getMasterBuffer(objectKey) {
      const publicUrl = this.getPublicUrl(objectKey);
      const res = await fetch(publicUrl);
      if (!res.ok) throw new Error(`OCI fetch failed: ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async makeThumbAndPut(masterBuffer, thumbKey) {
      const sharp = await getSharp();
      const thumb = await (sharp as unknown as (buf: Buffer) => import('sharp').Sharp)(masterBuffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      // sharp strips EXIF by default — no .withMetadata() = no EXIF in output.
      // Verified in RESEARCH Decision 4.
      await client.putObject({
        namespaceName: env.OCI_NAMESPACE!,
        bucketName: env.OCI_BUCKET_NAME!,
        objectName: thumbKey,
        contentType: 'image/jpeg',
        contentLength: thumb.length,
        putObjectBody: thumb,
      });
    },

    getPublicUrl(objectKey) {
      return `https://objectstorage.${env.OCI_REGION!}.oraclecloud.com/n/${env.OCI_NAMESPACE!}/b/${env.OCI_BUCKET_NAME!}/o/${objectKey}`;
    },
  };
}

export function getOciClient(): OciClient {
  if (override) return override;
  // Lazy-construct the real SDK client on first call so unit tests that
  // never call a route handler don't need OCI_* env vars.
  return (realClient ??= buildRealClient());
}

// ─── Magic-byte MIME sniff ────────────────────────────────────────────────
// We never trust the client's declared contentType — a client can PUT
// arbitrary bytes against the PAR URL after declaring image/jpeg in the
// upload-url body. Bytes land in a public-read bucket regardless, so the
// finalize step rejects anything that isn't JPEG or PNG by magic bytes.
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function sniffImageMime(buf: Buffer): 'image/jpeg' | 'image/png' | null {
  // JPEG needs at least 3 bytes; PNG needs exactly 8 bytes.
  // Check the shorter JPEG magic first so a 4-byte JPEG buffer still matches.
  if (buf.length >= JPEG_MAGIC.length && JPEG_MAGIC.every((b, i) => buf[i] === b)) {
    return 'image/jpeg';
  }
  if (buf.length >= PNG_MAGIC.length && PNG_MAGIC.every((b, i) => buf[i] === b)) {
    return 'image/png';
  }
  return null;
}
