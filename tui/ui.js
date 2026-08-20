const LEVEL_NAMES = ['Egg', 'Hatchling', 'Juvenile', 'Adult', 'Elder', 'Ascended'];
const LEVEL_STATES = ['dormant', 'awakening', 'growing', 'soaring', 'wise', 'transcendent'];
const LEVEL_COLORS = ['gray', 'cyan', 'cyan', 'cyanBright', 'cyanBright', 'cyanBright'];

const UNICODE_DRAGON_ARTS = {
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

const ASCII_DRAGON_ARTS = {
  0: [
    '        /-----\\        ',
    '       /  /-\\  \\       ',
    '      |  | o |  |      ',
    '      |  |   |  |      ',
    '      |   \\_/   |      ',
    '       \\       /       ',
    '        \\-----/        ',
  ],
  1: [
    '          /--\\          ',
    '     /----/  \\---\\      ',
    '    /  o    \\/    \\     ',
    '    \\    /\\    /\\  /    ',
    '     \\/\\/  \\/\\/  \\/     ',
  ],
  2: [
    '       /-\\  /-\\         ',
    '  /----/  \\/  \\---\\     ',
    ' /  o      __      \\    ',
    ' \\     /--------\\  /    ',
    '  \\---/  //////  \\/     ',
    '   \\_/          \\_/     ',
  ],
  3: [
    '     /---\\  /---\\       ',
    ' /---/   \\/   \\---\\     ',
    '/  o       __      \\    ',
    '|    /----------\\  |    ',
    ' \\--/  ////////  \\-/    ',
    '  \\/  //////////  \\/    ',
    '   \\_/          \\_/     ',
  ],
  4: [
    '   /---\\      /---\\     ',
    '/---/   \\____/   \\---\\  ',
    '| o        __        |  ',
    '|   /------------\\   |  ',
    ' \\-/  //////////// \\-/  ',
    '  /  ////////////  \\    ',
    ' /_/              \\_\\   ',
  ],
  5: [
    ' * /---\\      /---\\ *   ',
    '/-/   \\______/   \\-\\    ',
    '| o        __        |  ',
    '|   /--------------\\ |  ',
    ' \\-/  /////**/////  \\-/ ',
    '  /  /////    /////  \\  ',
    ' /_/   **      **   \\_\\ ',
    ' * \\______________/ *   ',
  ],
};

function getBorderStyle(asciiMode) {
  return asciiMode ? 'classic' : 'single';
}

function getProgressBar(width, progress, asciiMode) {
  const safeWidth = Math.max(1, width);
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * safeWidth);
  const fullChar = asciiMode ? '#' : '\u2588';
  const emptyChar = asciiMode ? '-' : '\u2591';
  return fullChar.repeat(filled) + emptyChar.repeat(safeWidth - filled);
}

function getStatusDot(active, asciiMode) {
  if (asciiMode) {
    return active ? ' *' : ' o';
  }
  return active ? ' \u25CF' : ' \u25CB';
}

function getSelectionPrefix(selected, asciiMode) {
  if (!selected) return '  ';
  return asciiMode ? '> ' : '\u25B6 ';
}

function getCheckMark(success, asciiMode) {
  if (asciiMode) {
    return success ? 'ok' : 'x';
  }
  return success ? '\u2713' : '\u2717';
}

function sanitizeTerminalText(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function getDragonArt(level, { asciiMode = false, compact = false } = {}) {
  const source = asciiMode ? ASCII_DRAGON_ARTS : UNICODE_DRAGON_ARTS;
  const art = source[level] || source[0];
  return compact ? art.slice(0, Math.min(4, art.length)) : art;
}

function isExitCommand(input) {
  const normalized = String(input || '').trim().toLowerCase();
  return [
    'exit',
    'quit',
    '/exit',
    '/quit',
    ':q',
    ':quit',
    ':exit'
  ].includes(normalized);
}

module.exports = {
  LEVEL_COLORS,
  LEVEL_NAMES,
  LEVEL_STATES,
  getBorderStyle,
  getCheckMark,
  getDragonArt,
  getProgressBar,
  getSelectionPrefix,
  getStatusDot,
  sanitizeTerminalText,
  sanitizeAsciiText: sanitizeTerminalText,
  isExitCommand
};
