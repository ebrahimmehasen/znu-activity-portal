import { ImageResponse } from "next/og";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export const dynamicParams = false;

/** App icon: the brand green with "ZNU", padded so it survives maskable cropping. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f5c4c",
          color: "#ffffff",
          fontSize: size * 0.26,
          fontWeight: 700,
          letterSpacing: size * 0.01,
        }}
      >
        ZNU
      </div>
    ),
    { width: size, height: size },
  );
}
