# Support playbook: lost authenticator or passkey (F-143)

Owners, finance contacts and Akana staff confirm with an authenticator app before they change billing, seats, members, prices, licences or payout details. If they lose the phone or the app, they cannot make those changes until support removes the old factor. Readers never need this.

There is no self-service reset and no recovery codes. That is deliberate. A reset is the easiest way to take over an account that controls money, so a person does it, after checking who is asking.

## Who may do a reset

Only Akana staff with the platform `owner` role. Support staff can take the request and run the checks, but an owner removes the factor. Never reset your own account: ask another owner.

## Checklist

1. **Take the request only from the account's own email address.** The person writes from the email they sign in with, through `/contact` or to support. If the request comes from another address, a phone call or social media, reply to the account's email address only, saying we got a request and asking them to confirm from that address.
2. **Open a support case** in the support inbox and tag it `mfa-reset`. Everything below goes in that case.
3. **Check the account.** In Supabase (Authentication, Users), find the user by email. Note the user id, when it was created and the last sign-in. Note their organisation and role from `/admin` (organisations, members).
4. **Check identity with two of the following.** Record which two and what you saw, never the documents themselves.
   - A video call where they show photo ID that matches the name on the organisation record (the legal name for the licence, the signer name on a signed licence, or the Stripe Connect representative). Do not keep a copy or a screenshot.
   - Confirmation from another owner or finance member of the same organisation, sent from their own account email.
   - For a paying organisation: the last invoice number and amount, or the last four digits of the bank account for payouts. Check these against Stripe yourself. Never read them out to the person.
   - For an author: the ISBN and the date the licence was signed, checked against `/admin`.
5. **Look for warning signs and stop if you see one.** Pressure to hurry. A change of account email in the last 30 days. A payout detail change asked for in the same message. Someone other than the account holder doing the talking. A request on the same day as a failed sign-in spike in `/admin/ops`. If in doubt, ask the organisation's other owner, or wait.
6. **Tell the organisation.** Email every other owner and finance member of the organisation: "We are resetting the sign-in check for [name] at their request. If you did not expect this, reply within 24 hours." Wait 24 hours before step 7, unless the person is the only owner and step 4 included a video ID check.
7. **Remove the factor.** In Supabase, open the user, find Multi-Factor Authentication, and delete the TOTP factor (and any passkey factor if that was lost too). Leave any factor they still have. If the dashboard offers to sign the user out everywhere, do that too, so no old session stays open.
8. **Write the audit note** in the case: who asked, when, the two checks used, the 24-hour notice and its result, the factor ids removed, and the owner who removed them. Staff actions in the Supabase dashboard are not in Akana's `audit_log`, so the case is the record.
9. **Reply to the person** from the account email thread: "We have reset your sign-in check. Next time you change billing, members or payouts, you will be asked to set up an authenticator app again. Do that straight away."
10. **Watch for 30 days.** For a payee, any payout detail change in the next 30 days gets a second look against Stripe.

## What not to do

- Do not turn off the second factor for an organisation or a role to unblock someone. The rule is in the database (migration 0032) and there is no switch for it, on purpose.
- Do not reset because someone is senior or in a hurry.
- Do not send a reset link or a code. There is none. The person sets up a new app themselves after the reset.
- Do not store ID images, bank details or invoice copies in the case.

## Passkeys

Passkeys are off (flag `mfa_passkey`). When they are switched on, a passkey is always a second way in next to the authenticator app, never the only one. A lost passkey device is handled the same way: remove only that passkey factor. If the person still has their authenticator app, they can sign in and carry on, so the 24-hour wait can be skipped, but run the identity checks all the same.
