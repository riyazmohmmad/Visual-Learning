/**
 * Application Feature Flags & Public Visibility Controls
 *
 * This configuration centralizes the temporary public UI and access changes.
 * Set both to `true` to immediately restore the public subject browsing,
 * public subject cards, and public portal buttons on the Home page.
 */
export const FEATURES = {
  // When false, public subject browsing and curriculum access from the Home page requires login
  PUBLIC_SUBJECT_BROWSING_ENABLED: false,

  // When false, public Student Portal and Teacher Portal shortcut buttons on the Home page are hidden
  PUBLIC_PORTAL_BUTTONS_ENABLED: false,
};
