const API_URL = (
  process.env.REACT_APP_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const MAX_IMAGE_DIMENSION = 1920;
const IMAGE_QUALITY = 0.85;

/*
  Animated and vector images would lose their content
  when they are redrawn on a canvas.
*/
const UNCOMPRESSED_IMAGE_TYPES = [
  "image/gif",
  "image/svg+xml",
];

/* ============================================================
   IMAGE COMPRESSION

   Returns the original file whenever compression fails or
   does not make the image smaller.
============================================================ */

const compressImage = async (file) => {
  if (UNCOMPRESSED_IMAGE_TYPES.includes(file.type)) {
    return file;
  }

  try {
    const bitmap = await window.createImageBitmap(file);

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION /
        Math.max(bitmap.width, bitmap.height)
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    canvas
      .getContext("2d")
      .drawImage(
        bitmap,
        0,
        0,
        canvas.width,
        canvas.height
      );

    bitmap.close();

    const compressed = await new Promise((resolve) => {
      canvas.toBlob(
        resolve,
        "image/webp",
        IMAGE_QUALITY
      );
    });

    return compressed && compressed.size < file.size
      ? compressed
      : file;
  } catch (compressionError) {
    console.error(
      "Image compression error:",
      compressionError
    );

    return file;
  }
};

/* ============================================================
   UPLOAD SIGNATURE
============================================================ */

const getUploadSignature = async (token, folder) => {
  const response = await fetch(
    `${API_URL}/api/uploads/signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folder }),
    }
  );

  if (response.status === 401) {
    throw new Error(
      "Your session has expired. Please log in again."
    );
  }

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Unable to start the upload."
    );
  }

  return data;
};

/* ============================================================
   UPLOAD

   Sends the file straight to Cloudinary and returns its URL.
   folder: "products" | "hero" | "blogs"
   resourceType: "image" | "video"
============================================================ */

export const uploadToCloudinary = async (
  file,
  {
    token,
    folder,
    resourceType = "image",
  }
) => {
  if (!token) {
    throw new Error(
      "Your session has expired. Please log in again."
    );
  }

  const signature = await getUploadSignature(
    token,
    folder
  );

  const uploadFile =
    resourceType === "image"
      ? await compressImage(file)
      : file;

  const body = new FormData();

  body.append("file", uploadFile, file.name);
  body.append("api_key", signature.api_key);
  body.append("folder", signature.folder);
  body.append("timestamp", signature.timestamp);
  body.append("signature", signature.signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloud_name}/${resourceType}/upload`,
    {
      method: "POST",
      body,
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok || !data.secure_url) {
    throw new Error(
      data.error?.message ||
        `Unable to upload ${file.name}.`
    );
  }

  return data.secure_url;
};
