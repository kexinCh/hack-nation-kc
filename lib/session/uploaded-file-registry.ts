"use client";

const files = new Map<string, File>();
const objectUrls = new Map<string, string>();

function keyFor(applicationId: string | undefined, documentId: string) {
  return applicationId ? `${applicationId}:${documentId}` : documentId;
}

export function registerUploadedFile(documentId: string, file: File, applicationId?: string) {
  const key = keyFor(applicationId, documentId);
  const previousUrl = objectUrls.get(key);
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  files.set(key, file);
  const objectUrl = URL.createObjectURL(file);
  objectUrls.set(key, objectUrl);
  return objectUrl;
}

export function replaceUploadedFileDocumentId(
  temporaryId: string,
  documentId: string,
  applicationId?: string,
) {
  const temporaryKey = keyFor(applicationId, temporaryId);
  const key = keyFor(applicationId, documentId);
  const file = files.get(temporaryKey);
  const objectUrl = objectUrls.get(temporaryKey);
  if (!file || !objectUrl) {
    return;
  }

  files.delete(temporaryKey);
  objectUrls.delete(temporaryKey);
  files.set(key, file);
  objectUrls.set(key, objectUrl);
}

export function getUploadedFile(documentId: string, applicationId?: string) {
  return files.get(keyFor(applicationId, documentId));
}

export function getUploadedFileUrl(documentId: string, applicationId?: string) {
  return objectUrls.get(keyFor(applicationId, documentId));
}

export function clearUploadedFiles() {
  for (const objectUrl of objectUrls.values()) {
    URL.revokeObjectURL(objectUrl);
  }

  files.clear();
  objectUrls.clear();
}
