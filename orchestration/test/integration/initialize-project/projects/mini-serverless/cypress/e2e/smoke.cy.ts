describe('smoke', () => {
  it('loads the login page', () => {
    cy.visit('/');
    cy.get('input[type="password"]').should('be.visible');
  });
});
