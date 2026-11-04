// The Halloween look: on through October, every year. index.html decides before first paint (so the football never
// flashes up first) by setting data-season on <html>; localStorage "halloween" (true or false) overrides the date,
// which the tests use. Halloween swaps the header's football for a jack-o'-lantern (css/base.css) and gives "google me"
// a 25% chance of a ghost (js/settings.js).
// Thanksgiving: from the Thursday a week before Thanksgiving to the Sunday after, the football (header, loading spinners,
// splash screen) is a drumstick whose meat is the football; localStorage "thanksgiving" overrides the date.

export const isHalloween = () => document.documentElement.dataset.season === "halloween";
export const isThanksgiving = () => document.documentElement.dataset.season === "thanksgiving";
