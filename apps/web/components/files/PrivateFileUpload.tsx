"use client";

import { useId, useState } from "react";
import { confirmUploadAction, requestUploadAction } from "@/app/files/actions";
import { FILE_RULES, FILE_TYPES, type FileKind } from "@/lib/storage/file-rules";

/**
 * Upload a manuscript or a signed licence to private storage (F-135).
 *
 *   <PrivateFileUpload orgId={org.id} kind="licences" inputName="licence_path" />
 *
 * The file goes from the browser straight to Supabase Storage on a signed
 * upload URL. When it is checked and recorded, its storage path is put in a
 * hidden input named inputName, so an enclosing form can submit it. Open a
 * stored file with a link to /files/open?path=<path>.
 */
export function PrivateFileUpload({
  orgId,
  kind,
  inputName = "file_path",
  label,
}: {
  orgId: string;
  kind: FileKind;
  inputName?: string;
  label?: string;
}) {
  const id = useId();
  const rule = FILE_RULES[kind];
  const accept = rule.exts.map((e) => `.${e},${FILE_TYPES[e]}`).join(",");
  const [state, setState] = useState<{ status: "idle" | "uploading" | "done" | "error"; message?: string; path?: string }>({ status: "idle" });

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState({ status: "uploading" });
    const ticket = await requestUploadAction({ orgId, kind, fileName: file.name, contentType: file.type, size: file.size });
    if (!ticket.ok) return setState({ status: "error", message: ticket.message });
    try {
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const res = await fetch(ticket.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
      if (!res.ok) return setState({ status: "error", message: `The upload did not finish. Check the file is ${rule.label}, then try again.` });
    } catch {
      return setState({ status: "error", message: "The upload did not finish. Check your connection and try again." });
    }
    const confirmed = await confirmUploadAction(ticket.path);
    if (!confirmed.ok) return setState({ status: "error", message: confirmed.message });
    setState({ status: "done", path: confirmed.path });
  }

  return (
    <div className="private-upload">
      <label htmlFor={id}>{label ?? (kind === "licences" ? "Signed licence" : "Manuscript")}</label>
      <p className="muted small" id={`${id}-hint`}>
        {rule.label}. Only your organisation and Akana staff can open it.
      </p>
      <input id={id} type="file" accept={accept} onChange={onChange} disabled={state.status === "uploading"} aria-describedby={`${id}-hint ${id}-status`} />
      <input type="hidden" name={inputName} value={state.path ?? ""} />
      <p id={`${id}-status`} className={state.status === "error" ? "form-error" : "muted small"} role={state.status === "error" ? "alert" : "status"}>
        {state.status === "uploading" ? "Uploading" : state.status === "done" ? "Uploaded and stored privately." : state.status === "error" ? state.message : ""}
      </p>
    </div>
  );
}
