// Page entry: the same link opens either the game or, with "#pad" / "#pad-1234", the phone controller.
const pad = /^#pad(?:-(\d{4}))?$/.exec(location.hash);
if (pad) void import('./phone/pad.ts').then((m) => m.startPad(pad[1] ?? null));
else void import('./main.ts');
