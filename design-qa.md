# Design QA

final result: passed

## Scope

- Android-sized viewport: 390 x 844 (375 px content viewport with scrollbar).
- Organizer password gate and protected organizer event API.
- Guest camera look switcher: Original / FLASH 98.
- One-line event date and location metadata.
- Polaroid album with alternating left/right rotation and handwritten author names.
- Removed guest footer copy and shortened the review upload action to `Сохранить`.

## Visual evidence

- Reference vs implementation: `.codex-qa-comparison.png`
- Organizer login: `.codex-qa-login.png`
- Camera screen: `.codex-qa-camera.png`
- Final mobile album: `.codex-qa-album-final-mobile.png`
- Dark leaderboard: `.codex-qa-leaderboard-dark.png`
- Album/leaderboard theme comparison: `.codex-qa-theme-comparison.png`
- Camera bulk-upload action: `.codex-qa-camera-bulk.png`

## Checks

- Date and location share the same vertical coordinate; long locations ellipsize.
- Body width equals viewport width; no horizontal overflow.
- Neighboring Polaroids alternate negative and positive rotation.
- Author labels render with the bundled Caveat font on the white print surface.
- Original mode removes grain, vignette, and flash halo; flash/date controls are disabled.
- Unauthenticated `/` redirects to `/login`.
- Unauthenticated `/api/events` returns 401 while guest `/e/[eventId]` stays public.
- Correct organizer password creates an HttpOnly, Secure-in-production, SameSite=Strict signed session.
- Fresh-browser console after final album load: no warnings or errors.
- Leaderboard uses the same `#0c0c0b` surface and dark card treatment as the camera and album.
- Multi-file input exposes `multiple` and `accept=image/*`; the action clearly states that uploads are unfiltered.
- Bulk upload processes files sequentially, reports progress, and respects the guest's remaining photo limit.
- `npm run lint`, `npm run build`, and `git diff --check`: passed.

## Iteration history

1. Replaced the album columns layout after visual rows paired cards with the same tilt.
2. Switched to a row-major grid and enforced odd/even left-right rotation.
3. Loaded the first four above-the-fold album images eagerly to clear the LCP warning.
4. Replaced the leaderboard's light surface and cards with the shared dark event theme.
5. Added a dedicated multi-file memory upload path that always uses the original renderer.
