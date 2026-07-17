const React = require('react');
const { Box, Text, useInput } = require('ink');
const { getBorderStyle, getProgressBar, getSelectionPrefix, sanitizeTerminalText } = require('../ui');

function Sidebar({ flowmind, width, onSkillSelect, focused, asciiMode = false, dense = false }) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [skills, setSkills] = React.useState([]);
  const [honorData, setHonorData] = React.useState({ points: 0, level: 0, stats: {} });
  const isCompact = dense || width < 36;
  const showSkills = !dense && !isCompact && width >= 48;
  const showDetails = !dense && !isCompact && width >= 64;

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

  React.useEffect(() => {
    if (skills.length === 0) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= skills.length) {
      setSelectedIndex(skills.length - 1);
    }
  }, [selectedIndex, skills.length]);

  useInput((input, key) => {
    if (!focused) return; // Ignore input when sidebar is not focused
    if (skills.length === 0) return;
    if (key.upArrow) setSelectedIndex(prev => Math.max(0, prev - 1));
    else if (key.downArrow) setSelectedIndex(prev => Math.min(skills.length - 1, prev + 1));
    else if (key.return && skills[selectedIndex] && onSkillSelect) onSkillSelect(skills[selectedIndex]);
  });

  const barWidth = Math.max(8, Math.min(24, width - 6));
  const progress = honorData.points > 0 ? Math.min(1, honorData.points / 100) : 0;
  const progressBar = getProgressBar(barWidth, progress, asciiMode);

  return (
    React.createElement(Box, { flexDirection: 'column', width: width, borderStyle: getBorderStyle(asciiMode), borderColor: focused ? 'cyan' : 'gray', paddingX: 1 },
      React.createElement(Text, { color: focused ? 'cyan' : 'gray' }, focused ? 'Workspace [Focused]' : 'Workspace'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Honor'),
        React.createElement(Text, { color: 'green' }, progressBar),
        React.createElement(Text, { color: 'gray' }, 'Lv' + (honorData.level || 0) + ' • ' + honorData.points + ' pts')
      ),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Focus'),
        React.createElement(Text, { color: focusHintColor(focused) }, focused ? 'Tab switches to chat' : 'Tab switches here')
      ),
      showDetails && React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Stats'),
        React.createElement(Text, { color: 'gray' }, 'Skills used: ' + (honorData.stats?.skillUseCount || 0)),
        React.createElement(Text, { color: 'gray' }, 'Learnings: ' + (honorData.stats?.learningCount || 0)),
        React.createElement(Text, { color: 'gray' }, 'New skills: ' + (honorData.stats?.newSkillCount || 0))
      ),
      showSkills && React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Skills (' + skills.length + ')'),
        React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
          skills.length === 0 && React.createElement(Text, { color: 'gray' }, 'No skills loaded'),
          skills.slice(0, 6).map((skill, i) => {
            const isSelected = i === selectedIndex;
            const category = skill.category || 'general';
            const prefix = getSelectionPrefix(isSelected, asciiMode);
            const displayName = asciiMode ? sanitizeTerminalText(skill.name) : skill.name;
            const displayCategory = asciiMode ? sanitizeTerminalText(category) : category;
            return React.createElement(Text, { key: skill.name },
              React.createElement(Text, { color: isSelected ? (focused ? 'green' : 'yellow') : 'white' }, prefix + displayName),
              React.createElement(Text, { color: 'gray' }, ' [' + displayCategory + ']')
            );
          }),
          skills.length > 6 && React.createElement(Text, { color: 'gray' }, '... ' + (skills.length - 6) + ' more')
        )
      )
    )
  );
}

function focusHintColor(focused) {
  return focused ? 'green' : 'gray';
}

module.exports = Sidebar;
