const React = require('react');
const { Box, Text, useInput } = require('ink');
const DragonTotem = require('./DragonTotem.jsx');

function Sidebar({ flowmind, width, onSkillSelect }) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [skills, setSkills] = React.useState([]);
  const [honorData, setHonorData] = React.useState({ points: 0, level: 0, stats: {} });

  React.useEffect(() => {
    if (flowmind) {
      try {
        const list = flowmind.skills.list() || [];
        setSkills(list);
      } catch (e) {
        setSkills([]);
      }
      try {
        setHonorData(flowmind.getHonorData());
      } catch (e) {
        // keep default honorData
      }
    }
  }, [flowmind]);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(prev => Math.max(0, prev - 1));
    else if (key.downArrow) setSelectedIndex(prev => Math.min(skills.length - 1, prev + 1));
    else if (key.return && skills[selectedIndex] && onSkillSelect) onSkillSelect(skills[selectedIndex]);
  });

  const barWidth = Math.max(10, width - 4);
  const progress = honorData.points > 0 ? Math.min(1, honorData.points / 100) : 0;
  const filled = Math.round(progress * barWidth);
  const progressBar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);

  return (
    React.createElement(Box, { flexDirection: 'column', width: width, borderStyle: 'single', borderColor: 'cyan', paddingX: 1 },
      React.createElement(DragonTotem, { honorData: honorData, compact: true }),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Progress'),
        React.createElement(Text, { color: 'green' }, progressBar),
        React.createElement(Text, { color: 'gray' }, honorData.points + '/100 pts')
      ),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Skills (' + skills.length + ')'),
        React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
          skills.length === 0 && React.createElement(Text, { color: 'gray' }, 'No skills loaded'),
          skills.map((skill, i) => {
            const isSelected = i === selectedIndex;
            const category = skill.category || 'general';
            const prefix = isSelected ? '\u25B6 ' : '  ';
            return React.createElement(Text, { key: skill.name },
              React.createElement(Text, { color: isSelected ? 'green' : 'white' }, prefix + skill.name),
              React.createElement(Text, { color: 'gray' }, ' [' + category + ']')
            );
          })
        )
      ),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Stats'),
        React.createElement(Text, { color: 'gray' }, 'Skills used: ' + (honorData.stats?.skillUseCount || 0)),
        React.createElement(Text, { color: 'gray' }, 'Learnings: ' + (honorData.stats?.learningCount || 0)),
        React.createElement(Text, { color: 'gray' }, 'New skills: ' + (honorData.stats?.newSkillCount || 0))
      )
    )
  );
}

module.exports = Sidebar;
