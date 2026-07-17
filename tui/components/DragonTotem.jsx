const React = require('react');
const { Box, Text } = require('ink');
const { LEVEL_COLORS, LEVEL_NAMES, LEVEL_STATES, getDragonArt } = require('../ui');

function DragonTotem({ honorData, compact, asciiMode = false, width = 0 }) {
  const points = honorData?.points || 0;
  const level = honorData?.level || 0;
  const art = getDragonArt(level, { asciiMode, compact });
  const color = LEVEL_COLORS[level] || 'gray';
  const levelName = LEVEL_NAMES[level] || 'Unknown';
  const state = LEVEL_STATES[level] || 'unknown';
  const nextLevelPoints = [1, 10, 30, 60, 100];
  const nextPoints = nextLevelPoints[level] || null;
  const pointsToNext = nextPoints !== null ? nextPoints - points : 0;
  const superCompact = width > 0 && width < 26;

  if (superCompact) {
    return (
      React.createElement(Box, { flexDirection: 'column', paddingX: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Dragon'),
        React.createElement(Text, { color: color }, 'Lv' + level + ' ' + levelName),
        React.createElement(Text, { color: 'gray' }, points + ' pts')
      )
    );
  }

  return (
    React.createElement(Box, { flexDirection: 'column', paddingX: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'Dragon Totem'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        art.map((line, i) => React.createElement(Text, { key: i, color: color }, line))
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
