import ImageKit, { toFile } from "@imagekit/nodejs";

const getEnv = (key: string) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const getImageKitClient = () => {
  return new ImageKit({
    privateKey: getEnv("IMAGEKIT_PRIVATE_KEY"),
  });
};

const buildBackgroundRemovalUrl = (uploadedUrl: string) => {
  const separator = uploadedUrl.includes("?") ? "&" : "?";
  return `${uploadedUrl}${separator}tr=e-bgremove`;
};

const buildTransformationUrl = (uploadedUrl: string, transformation: string) => {
  const separator = uploadedUrl.includes("?") ? "&" : "?";
  return `${uploadedUrl}${separator}tr=${transformation}`;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchTransformedImage = async (url: string) => {
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("ImageKit transform failed to return a valid file.");
    }

    const isIntermediateResponse =
      response.headers.get("is-intermediate-response") === "true";
    const contentType = response.headers.get("content-type") || "";
    const isHtmlResponse = contentType.includes("text/html");

    if (!isIntermediateResponse && !isHtmlResponse) {
      const transformedBuffer = Buffer.from(await response.arrayBuffer());

      return transformedBuffer;
    }

    if (attempt === maxAttempts - 1) {
      throw new Error(
        "Image transform is taking longer than expected. Please try again in a few seconds.",
      );
    }

    await delay(1800);
  }

  throw new Error("ImageKit transform failed to complete.");
};

export const uploadImageToImageKit = async ({
  fileBuffer,
  fileName,
  folder,
}: {
  fileBuffer: Buffer;
  fileName: string;
  folder?: string;
}) => {
  const client = getImageKitClient();

  const uploaded = await client.files.upload({
    file: await toFile(fileBuffer, fileName),
    fileName,
    folder,
    useUniqueFileName: true,
  });

  return {
    url: uploaded.url,
    fileId: uploaded.fileId,
    name: uploaded.name,
  };
};

export const getBackgroundRemovedImage = async ({
  sourceBuffer,
  sourceFileName,
  folder,
}: {
  sourceBuffer: Buffer;
  sourceFileName: string;
  folder?: string;
}) => {
  const uploaded = await uploadImageToImageKit({
    fileBuffer: sourceBuffer,
    fileName: sourceFileName,
    folder,
  });

  if (!uploaded.url) {
    throw new Error("ImageKit upload returned an empty URL.");
  }

  const transformedUrl = buildBackgroundRemovalUrl(uploaded.url);
  const transformedBuffer = await fetchTransformedImage(transformedUrl);

  return {
    transformedBuffer,
    transformedUrl,
    sourceImageKitFileId: uploaded.fileId,
  };
};

export const getImageWithTransformation = async ({
  sourceBuffer,
  sourceFileName,
  transformation,
  folder,
}: {
  sourceBuffer: Buffer;
  sourceFileName: string;
  transformation: string;
  folder?: string;
}) => {
  const uploaded = await uploadImageToImageKit({
    fileBuffer: sourceBuffer,
    fileName: sourceFileName,
    folder,
  });

  if (!uploaded.url) {
    throw new Error("ImageKit upload returned an empty URL.");
  }

  const transformedUrl = buildTransformationUrl(uploaded.url, transformation);
  const transformedBuffer = await fetchTransformedImage(transformedUrl);

  return {
    transformedBuffer,
    transformedUrl,
    sourceImageKitFileId: uploaded.fileId,
  };
};
