import { setFollow } from "@/app/authors/[slug]/actions";

/**
 * The follow button on an author page (build list 2.10). A plain form, so it
 * works without scripts. Following is the reader's own choice and private:
 * the line under the button says so. A signed-out visitor is sent to sign in
 * and returns to the same page.
 */
export function FollowAuthor({ slug, following, signedIn, failed }: { slug: string; following: boolean; signedIn: boolean; failed?: boolean }) {
  return (
    <form action={setFollow} className="follow-author">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="follow" value={following ? "no" : "yes"} />
      <button type="submit" className={following ? "btn secondary" : "btn"} aria-pressed={following}>
        {following ? "Following" : "Follow this author"}
      </button>
      <p className="muted small">
        {following
          ? "You will see their new workbooks on Explore. Select again to stop following."
          : signedIn
            ? "New workbooks by this author will show on Explore. Following is private."
            : "Sign in to follow. Following is private."}
      </p>
      {failed ? (
        <p className="form-error" role="alert">
          That did not save. Try again.
        </p>
      ) : null}
    </form>
  );
}
