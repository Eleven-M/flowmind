const React = require('react');
const { Box, Text } = require('ink');
const { LEVEL_NAMES, getBorderStyle, getProgressBar } = require('../../tui/ui');

function StatsRow({ flowmind, asciiMode = false, width = 0, compact = false }) {
  const [honorData, setHonorData] = React.useState({ points: 0, level: 0, stats: {} });
  const [learningStats, setLearningStats] = React.useState({ totalRecords: 0, byType: {} });
  const [aiStatus, setAiStatus] = React.useState({ initialized: false, defaultProvider: 'none' });

  React.useEffect(() => {
    if (!flowmind) return;
    const refresh = () => {
      try { setHonorData(flowmind.getHonorData()); } catch (e) { /* ignore */ }
      try { flowmind.getStats().then(s => setLearningStats(s)); } catch (e) { /* ignore */ }
      try { setAiStatus(flowmind.getAIStatus()); } catch (e) { /* ignore */ }
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [flowmind]);

  const barWidth = compact ? Math.max(8, Math.floor(width / 10)) : 16;
  const progress = honorData.points > 0 ? Math.min(1, honorData.points / 100) : 0;
  const progressBar = getProgressBar(barWidth, progress, asciiMode);
  const aiModel = aiStatus.defaultModel || 'auto';

  if (compact) {
    return (
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'yellow', paddingX: 1, width: '100%' },
          React.createElement(Text, { bold: true, color: 'yellow' }, 'Honor'),
          React.createElement(Text, { color: 'yellow' }, LEVEL_NAMES[honorData.level] || 'Egg'),
          React.createElement(Text, { color: 'green' }, progressBar),
          React.createElement(Text, { color: 'gray' }, honorData.points + '/100 pts')
        ),
        React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'cyan', paddingX: 1, width: '100%', marginTop: 1 },
          React.createElement(Text, { bold: true, color: 'cyan' }, 'Learning'),
          React.createElement(Text, { color: 'white' }, '' + (learningStats.totalRecords || 0) + ' records'),
          React.createElement(Text, null,
            React.createElement(Text, { color: 'gray' }, 'AI: '),
            React.createElement(Text, { color: aiStatus.initialized ? 'green' : 'red' }, aiStatus.initialized ? `ok (${aiModel})` : 'off')
          )
        ),
        React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'blue', paddingX: 1, width: '100%', marginTop: 1 },
          React.createElement(Text, { bold: true, color: 'blue' }, 'Components'),
          React.createElement(Text, { color: 'gray' }, aiStatus.defaultProvider || 'none')
        )
      )
    );
  }

  return (
    React.createElement(Box, { flexDirection: 'row' },
      React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'yellow', paddingX: 1, width: '33%' },
        React.createElement(Text, { bold: true, color: 'yellow' }, 'Honor'),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'yellow' }, LEVEL_NAMES[honorData.level] || 'Egg'),
          React.createElement(Text, { color: 'gray' }, ' Lv' + honorData.level)
        ),
        React.createElement(Text, { color: 'green' }, progressBar),
        React.createElement(Text, { color: 'gray' }, honorData.points + '/100 pts')
      ),
      React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'cyan', paddingX: 1, width: '33%' },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Learning'),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'white' }, '' + (learningStats.totalRecords || 0)),
          React.createElement(Text, { color: 'gray' }, ' records')
        ),
        Object.entries(learningStats.byType || {}).map(([type, count]) =>
          React.createElement(Text, { key: type, color: 'gray' }, '  ' + type + ': ' + count)
        ),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'AI: '),
          React.createElement(Text, { color: aiStatus.initialized ? 'green' : 'red' }, aiStatus.initialized ? `ok (${aiModel})` : 'off')
        )
      ),
      React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'blue', paddingX: 1, width: '33%' },
        React.createElement(Text, { bold: true, color: 'blue' }, 'Components'),
        React.createElement(Text, { color: 'gray' }, 'Registry loaded'),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'Provider: '),
          React.createElement(Text, { color: aiStatus.initialized ? 'green' : 'red' }, `${aiStatus.defaultProvider || 'none'} / ${aiModel}`)
        )
      )
    )
  );
}

module.exports = StatsRow;
