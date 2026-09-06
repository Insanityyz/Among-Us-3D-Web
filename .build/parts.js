/* The single source of truth for the JS part order. assemble.js, smoke.js and soak.js all
   read this, so a new part can never be shipped without being tested. */
module.exports=[
  '30_logic.js',
  '40_three.js',
  '41_ship.js',
  '50_player.js',
  '60_server.js',
  '65_audio_fx.js',
  '70_tasks.js',
  '80_meeting.js',
  '90_ui.js',
  '92_diag.js',
  '95_game.js',
  '99_main.js',
];
