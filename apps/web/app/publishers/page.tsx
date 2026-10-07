import { permanentRedirect } from "next/navigation";

/** Publishers are listed with authors on /authors (F-006). */
export default function PublishersPage() {
  permanentRedirect("/authors#publishers");
}
