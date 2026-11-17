'use strict';
// Sensible defaults per trade, so an owner can accept everything and still
// get a receptionist that knows their work.

const TRADES = {
  plumbing: {
    label: 'Plumbing', icon: '🔧', jobValue: 350,
    services: ['Leaks & drips', 'Clogged drains', 'Water heaters', 'Toilets', 'Burst pipes', 'Sewer & septic', 'New fixtures'],
  },
  hvac: {
    label: 'Heating & Cooling', icon: '❄️', jobValue: 450,
    services: ['No heat', 'No cooling', 'Furnace repair', 'AC repair', 'Tune-ups', 'New systems', 'Thermostats'],
  },
  electrical: {
    label: 'Electrical', icon: '⚡', jobValue: 400,
    services: ['Outlets & switches', 'Breaker trips', 'Lighting', 'Panel upgrades', 'EV chargers', 'Generators', 'Power outages'],
  },
  roofing: {
    label: 'Roofing', icon: '🏠', jobValue: 1500,
    services: ['Roof leaks', 'Storm damage', 'Inspections', 'Repairs', 'Full replacement', 'Gutters'],
  },
  towing: {
    label: 'Towing', icon: '🚛', jobValue: 150,
    services: ['Tows', 'Jump starts', 'Flat tires', 'Lockouts', 'Fuel delivery', 'Winch-outs'],
  },
  locksmith: {
    label: 'Locksmith', icon: '🔑', jobValue: 180,
    services: ['Lockouts', 'Rekeying', 'New locks', 'Car keys', 'Safes', 'Smart locks'],
  },
  // Niche trades: busy owner-operators, rarely any phone automation yet.
  septic: {
    label: 'Septic', icon: '🚽', jobValue: 450,
    services: ['Pumping', 'Backups', 'Inspections', 'Drain field repair', 'New systems', 'Grease traps'],
  },
  well: {
    label: 'Well & Pump', icon: '💧', jobValue: 900,
    services: ['No water', 'Well pump repair', 'Pressure tanks', 'Water testing', 'New pumps', 'Filtration'],
  },
  garage: {
    label: 'Garage Doors', icon: '🚪', jobValue: 350,
    services: ['Broken springs', 'Openers', 'Door off track', 'New doors', 'Tune-ups', 'Remotes & keypads'],
  },
  appliance: {
    label: 'Appliance Repair', icon: '🧊', jobValue: 250,
    services: ['Refrigerators', 'Washers', 'Dryers', 'Dishwashers', 'Ovens & ranges', 'Ice makers'],
  },
  tree: {
    label: 'Tree Service', icon: '🌳', jobValue: 1200,
    services: ['Tree removal', 'Storm damage', 'Trimming', 'Stump grinding', 'Emergency tree work', 'Estimates'],
  },
  pest: {
    label: 'Pest Control', icon: '🐜', jobValue: 300,
    services: ['Ants', 'Mice & rats', 'Termites', 'Bed bugs', 'Wasps & bees', 'Quarterly service'],
  },
  restoration: {
    label: 'Water & Fire Restoration', icon: '🧯', jobValue: 3500,
    services: ['Water damage', 'Flood cleanup', 'Mold', 'Fire & smoke damage', 'Sewage cleanup', 'Insurance claims'],
  },
  chimney: {
    label: 'Chimney', icon: '🔥', jobValue: 400,
    services: ['Chimney sweeping', 'Inspections', 'Repairs', 'Caps & dampers', 'Relining', 'Leaks'],
  },
  mechanic: {
    label: 'Mobile Mechanic', icon: '🛠️', jobValue: 350,
    services: ['No start', 'Brakes', 'Batteries', 'Diagnostics', 'Oil changes', 'Fleet service'],
  },
  other: {
    label: 'Something else', icon: '🧰', jobValue: 300,
    services: ['Repairs', 'Installations', 'Estimates', 'Maintenance'],
  },
};

// Words that fast-track a call. Each has a short safety line the receptionist says.
const EMERGENCIES = [
  { re: /\b(gas smell|smell(s|ing)? (of |like )?gas|gas leak|smell gas)\b/i, label: 'Gas smell',
    tip: 'Please get everyone out of the house and call the gas company’s emergency line from outside. Don’t flip any switches.' },
  { re: /\b(spark(s|ing)?|smok(e|ing)|burning smell|smells? like burning|on fire|fire)\b/i, label: 'Sparking or burning',
    tip: 'If you can safely reach the breaker, switch it off. If there’s any flame, call 911 first.' },
  { re: /\b(flood(ed|ing)?|burst|water everywhere|pouring|gushing|sewage|backing up|overflowing)\b/i, label: 'Flooding',
    tip: 'If you can, shut off the main water valve — it’s usually near the water meter or where the line comes into the house.' },
  { re: /\b(no heat|furnace (is )?(out|dead|not working|broke)|heat (is )?(out|off|not working)|freezing in here|pipes? (are |is )?froz(en|e))\b/i, label: 'No heat',
    tip: 'Keep doors closed to hold the heat in, and run a trickle of water from taps so pipes don’t freeze.' },
  { re: /\b(no (power|electricity)|power(’s|'s| is)? out|lost power)\b/i, label: 'No power', tip: '' },
  { re: /\b(lock(ed)? out|locked (my )?(keys|kid|baby|child|dog)|keys? (locked )?in (the )?car)\b/i, label: 'Locked out',
    tip: 'If a child or pet is locked in a hot car, call 911 right now.' },
  { re: /\b(roof (is )?(leaking|caved)|hole in (the|my) roof|ceiling (is )?(leaking|dripping|coming down))\b/i, label: 'Active roof leak',
    tip: 'Put a bucket under the drip and move anything valuable out of the way.' },
  { re: /\b(stranded|stuck on the (highway|side of the road|interstate)|broke(n)? down|accident|crash(ed)?|ditch)\b/i, label: 'Stranded driver',
    tip: 'Turn on your hazard lights and stay somewhere safe off the road.' },
  { re: /\b(no water|(well|pump) (quit|died|stopped|isn'?t working|not working|went out)|lost water pressure)\b/i, label: 'No water',
    tip: 'Check the breaker for the well pump first. If it tripped more than once, leave it off until we get there.' },
  { re: /\b(tree (fell|came down|is down|down) (on|across|through|onto)|limb (fell )?(on|through)|tree on (the|my) (house|roof|car|driveway))\b/i, label: 'Tree down',
    tip: 'Stay clear of the tree and any downed power lines — if a line is down, call the power company too.' },
  { re: /\b(garage door (is )?(stuck|won'?t (close|open|go down|go up)|came off|fell|off (the )?track)|car (is )?(stuck|trapped) in (the )?garage|broken spring)\b/i, label: 'Garage door stuck',
    tip: 'Please don’t try to force the door or touch the springs — they’re under a lot of tension.' },
  { re: /\b(wasps?|hornets?|yellow ?jackets?|bees?) (nest|swarm|everywhere|inside|in the house)|\b(swarm of|nest of) (wasps|hornets|bees)\b/i, label: 'Stinging insects',
    tip: 'Keep everyone inside and away from the nest. If someone’s allergic and gets stung, call 911.' },
  { re: /\b(emergency|urgent|asap|right away|right now)\b/i, label: 'Urgent', tip: '' },
];

function detectEmergency(text) {
  for (const e of EMERGENCIES) if (e.re.test(text || '')) return e;
  return null;
}

module.exports = { TRADES, EMERGENCIES, detectEmergency };
