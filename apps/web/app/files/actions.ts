"use server";

import { confirmPrivateUpload, requestPrivateUpload, type UploadConfirm, type UploadTicket } from "@/lib/storage/private-files";

/**
 * Server actions behind components/files/PrivateFileUpload (F-135). Next
 * checks the Origin header; Storage policies decide who may upload.
 */
export async function requestUploadAction(input: { orgId: string; kind: string; fileName: string; contentType: string; size: number }): Promise<UploadTicket> {
  return requestPrivateUpload(input);
}

export async function confirmUploadAction(path: string): Promise<UploadConfirm> {
  return confirmPrivateUpload(path);
}
