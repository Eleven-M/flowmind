const React = require('react');
const { Box, Text } = require('ink');
const { LEVEL_COLORS, LEVEL_NAMES, LEVEL_STATES, getBorderStyle, getDragonArt } = require('../../tui/ui');

function DragonPanel({ flowmind, asciiMode = false, width = 0, compact = false }) {
  const [honorData, setHonorData] = React.useState({ points: 0, level: 0, stats: {} });

  React.useEffect(() => {
    if (!flowmind) return;
    const refresh = () => {
      try { setHonorData(flowmind.getHonorData()); } catch (e) { /* ignore */ }
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [flowmind]);

  const level = honorData.level || 0;
  const art = getDragonArt(level, { asciiMode });
  const color = LEVEL_COLORS[level] || 'gray';
  const levelName = LEVEL_NAMES[level] || 'Unknown';
  const state = LEVEL_STATES[level] || 'unknown';
  const nextLevelPoints = [1, 10, 30, 60, 100];
  const nextPoints = nextLevelPoints[level] || null;
  const pointsToNext = nextPoints !== null ? nextPoints - honorData.points : 0;
  const superCompact = compact || width < 120;

  if (superCompact) {
    return (
      React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'cyan', paddingX: 1, flexGrow: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Dragon Totem'),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'yellow', bold: true }, 'Lv' + level),
          React.createElement(Text, { color: 'white' }, ' ' + levelName)
        ),
        React.createElement(Text, { color: 'gray' }, 'State: ' + state),
        React.createElement(Text, { color: 'gray' }, honorData.points + ' pts'),
        pointsToNext > 0 && React.createElement(Text, { color: 'gray' }, pointsToNext + ' to next')
      )
    );
  }

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'cyan', paddingX: 1, flexGrow: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'Dragon Totem'),
      React.createElement(Box, { flexDirection: 'row', marginTop: 1 },
        React.createElement(Box, { flexDirection: 'column' },
          art.map((line, i) => React.createElement(Text, { key: i, color: color }, line))
        ),
        React.createElement(Box, { flexDirection: 'column', marginLeft: 3, justifyContent: 'center' },
          React.createElement(Text, null,
            React.createElement(Text, { color: 'yellow', bold: true }, 'Lv' + level),
            React.createElement(Text, { color: 'white' }, ' ' + levelName)
          ),
          React.createElement(Text, { color: 'gray' }, 'State: ' + state),
          React.createElement(Text, null,
            React.createElement(Text, { color: 'yellow' }, '' + honorData.points),
            React.createElement(Text, { color: 'gray' }, ' points')
          ),
          pointsToNext > 0 && React.createElement(Text, { color: 'gray' }, pointsToNext + ' to next'),
          React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
            React.createElement(Text, { color: 'gray' }, 'Skills: ' + (honorData.stats?.skillUseCount || 0)),
            React.createElement(Text, { color: 'gray' }, 'Learnings: ' + (honorData.stats?.learningCount || 0))
          )
        )
      )
    )
  );
}

module.exports = DragonPanel;
