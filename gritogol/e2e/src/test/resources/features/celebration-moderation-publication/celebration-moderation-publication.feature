@celebration-moderation-publication
Feature: Celebration moderation and publication

  Background:
    Given the fan opens GritoGol at "http://localhost:5173/" as a guest on the "Uruguay vs España" match
    And the fan has saved the display name "QA Fan A" in the "Perfil" tab

  @TC-CELEBMODER-001 @P1 @smoke @tg-cmv5k97qp001j01t87mon5h5w @fail @BUG-001 @BUG-002 @spec-mismatch
  Scenario: TC-CELEBMODER-001 Upload celebration after a goal — published on the wall
    When the fan taps the demo button "Disparar gol ahora"
    Then the goal screen "¡GOOOL!" is shown with a countdown and the button "Subir festejo"
    When the fan taps "Subir festejo" and selects the video file "celebration.webm"
    Then the message "El video está siendo revisado" is shown
    And the confirmation "¡Ya estás en el muro!" is shown
    And the first card on "Muro de la hinchada" is the celebration by "QA Fan A"
    And the "pelotas" counter under "Impacto desbloqueado hoy" goes from "47" to "48"
