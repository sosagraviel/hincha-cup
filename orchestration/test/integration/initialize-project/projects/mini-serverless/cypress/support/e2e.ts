// Cypress support — runs before every spec. Stub for now.
Cypress.on('uncaught:exception', (err) => {
  // Don't fail the test on Firebase emulator warnings.
  if (err.message.includes('emulator')) return false;
});
