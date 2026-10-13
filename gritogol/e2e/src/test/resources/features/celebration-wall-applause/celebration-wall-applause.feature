@celebration-wall-applause
Feature: Celebration wall and applause

  Background:
    Given a celebration by "QA Fan A" is published on the "Muro de la hinchada" of the "Uruguay vs España" match with "0" applause
    And a second fan opens GritoGol at "http://localhost:5173/" as a guest in a separate browser session

  @TC-CELEBWALL-001 @P1 @smoke @tg-cmv5k97xq000x01s3cwj8zsn2 @fail @BUG-101
  Scenario: TC-CELEBWALL-001 Applaud another fan's celebration — count goes up by one
    When the second fan taps the applause button on the "QA Fan A" celebration card
    Then the applause count on the "QA Fan A" card shows "1" and the heart is filled
    And the message "No se pudo aplaudir" is not shown
    When the second fan reloads the page
    Then the "QA Fan A" card still shows "1" applause
