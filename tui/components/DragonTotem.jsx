const React = require('react');
const { Box, Text } = require('ink');

const DRAGON_ARTS = {
  0: [
    '        ╭─────╮        ',
    '       ╱  ╭─╮  ╲       ',
    '      │  │   │  │      ',
    '      │  │ ◎ │  │      ',
    '      │   ╰─╯   │      ',
    '       ╲       ╱       ',
    '        ╰─────╯        ',
  ],
  1: [
    '           ╭──╮            ',
    '      ╭────╯  ╰───╮        ',
    '     ╱  ◎    ╰─╯   ╲      ',
    '    ╱    ▽           ╲     ',
    '    ╲    ╱╲   ╱╲     ╱     ',
    '     ╲╱╱  ╲╱╱  ╲╱╲╱       ',
  ],
  2: [
    '        ╭─╮  ╭─╮             ',
    '   ╭────╯ ╰──╯ ╰───╮         ',
    '  ╱  ◎      ╰──╯     ╲       ',
    ' ╱      ╭────────╮     ╲     ',
    ' ╲     ╱ ╱╱╱╱╱╱╱╱ ╲    ╱     ',
    '  ╲───╯ ╱╱╱╱╱╱╱╱╱╱ ╰──╱      ',
    '   ╰─╯            ╰─╯       ',
  ],
  3: [
    '      ╭───╮  ╭───╮               ',
    '  ╭───╯   ╰──╯   ╰───╮           ',
    ' ╱  ◎        ╰───╯     ╲         ',
    '│     ╭──────────╮      │        ',
    '│    ╱ ╱╱╱╱╱╱╱╱╱╱ ╲     │        ',
    ' ╲──╯ ╱╱╱╱╱╱╱╱╱╱╱╱ ╰───╯        ',
    '  ╲  ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ╱         ',
    '   ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱          ',
    '    ╰───╯       ╰───╯            ',
  ],
  4: [
    '    ╭───╮      ╭───╮                 ',
    '╭───╯   ╰──────╯   ╰───╮             ',
    '│  ◎           ╰───╯     │           ',
    '│      ╭────────────╮    │           ',
    '│     ╱ ╱╱╱╱╱╱╱╱╱╱╱╱ ╲   │           ',
    ' ╲───╯ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ ╰──╯          ',
    '  ╲   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ╲          ',
    '   ╲─╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╰─╲         ',
    '    ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱         ',
    '     ╰───╯         ╰───╯             ',
  ],
  5: [
    '  ★  ╭───╮          ╭───╮  ★           ',
    '╭─╯   ╰──╯          ╰──╯   ╰─╮         ',
    '│  ◎            ╰───╯         │         ',
    '│       ╭──────────────╮      │         ',
    '│      ╱ ★╱╱╱╱╱╱╱╱╱╱★╱╱ ╲     │         ',
    ' ╲────╯ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱ ╰───╯         ',
    '  ╲    ╱╱╱╱★╱╱╱╱╱╱╱╱★╱╱╱╱╱  ╲          ',
    '   ╲──╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╰──╲         ',
    '    ╲─╯╱╱╱★╱╱╱╱╱╱╱╱★╱╱╱╱╱╰──╲         ',
    '  ★  ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ★       ',
    '       ╰───╯           ╰───╯            ',
  ],
};

const LEVEL_NAMES = ['Egg', 'Hatchling', 'Juvenile', 'Adult', 'Elder', 'Ascended'];
const LEVEL_STATES = ['dormant', 'awakening', 'growing', 'soaring', 'wise', 'transcendent'];
const LEVEL_COLORS = ['gray', 'cyan', 'cyan', 'cyanBright', 'cyanBright', 'cyanBright'];

function DragonTotem({ honorData, compact }) {
  const points = honorData?.points || 0;
  const level = honorData?.level || 0;
  const art = DRAGON_ARTS[level] || DRAGON_ARTS[0];
  const color = LEVEL_COLORS[level] || 'gray';
  const levelName = LEVEL_NAMES[level] || 'Unknown';
  const state = LEVEL_STATES[level] || 'unknown';
  const nextLevelPoints = [1, 10, 30, 60, 100];
  const nextPoints = nextLevelPoints[level] || null;
  const pointsToNext = nextPoints !== null ? nextPoints - points : 0;
  const lines = compact ? art.slice(0, 4) : art;

  return (
    React.createElement(Box, { flexDirection: 'column', paddingX: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'Dragon Totem'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        lines.map((line, i) => React.createElement(Text, { key: i, color: color }, line))
      ),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, null,
          React.createElement(Text, { color: 'yellow' }, 'Lv' + level),
          React.createElement(Text, { color: 'white' }, ' ' + levelName),
          React.createElement(Text, { color: 'gray' }, ' (' + state + ')')
        ),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'yellow' }, '' + points),
          React.createElement(Text, { color: 'gray' }, ' pts')
        ),
        pointsToNext > 0 && React.createElement(Text, { color: 'gray' }, pointsToNext + ' pts to ' + LEVEL_NAMES[level + 1]),
        pointsToNext <= 0 && level >= 5 && React.createElement(Text, { color: 'yellow' }, 'Max level!')
      )
    )
  );
}

module.exports = DragonTotem;
