// Bespoke, production-ready creative prompts for every curated playable showcase video.
// Every video carries a distinct title, director brief, technical camera/grade note, and shot pass list.

export const SHOWCASE_PROMPTS = {
  // =========================================================================
  // DRAMA & MICRO-DRAMA (Filmmaking — Drama)
  // =========================================================================
  'micro-drama-movie-146': {
    title: 'Gatot Kaca Pergiwa · Ep. 2',
    subtitle: '9:16 Mythic Action Drama',
    prompt:
      'Direct Episode 2 of a mythic Nusantara martial-arts micro-drama in 9:16: Gatot Kaca confronts a rival warlord atop a misty volcanic cliff at twilight while Pergiwa watches from a burning temple archway. Open on a tight 50mm anamorphic push-in as embers drift past ornate gold-and-iron armor, then whip-pan into a suspended mid-air clash illuminated by warm torchlight and cold moonlit haze.',
    promptExtra:
      'Shot on 35mm anamorphic emulation, 24fps, shallow f/2.0 depth of field, bronze-and-indigo color grade, wind-whipped fabric physics, and booming Javanese percussion swells.',
    assistantLead:
      'I will lock costume continuity on the embossed brass breastplate and stage the cliffside duel in three linked dramatic camera setups.',
    actions: [
      { title: 'Lock "Twilight Cliff Confrontation"', meta: '50mm anamorphic push-in, floating volcanic embers' },
      { title: 'Choreograph "Aerial Armor Clash"', meta: 'Slow-motion impact ramp at 120fps, rim backlight' },
      { title: 'Cut "Pergiwa Cliffhanger Reaction"', meta: 'Matched eye-line reverse shot, torchlight key' },
    ],
  },
  'micro-drama-movie-148': {
    title: 'Dragon Warrior · Trailer',
    subtitle: '16:9 Epic Fantasy Trailer',
    prompt:
      'Cut a 16:9 theatrical fantasy trailer following a lone armored warrior crossing a scorched mountain pass as an ancient dragon descends through storm clouds. Build from an atmospheric wide crane reveal over smoking pine valleys into rapid-fire combat beats, glowing molten scales reflecting on damp steel, and a final roar silhouette against lightning.',
    promptExtra:
      'Widescreen 2.39:1 framing, teal-and-amber blockbuster LUT, volumetric storm fog, handheld camera shake on wingbeat impacts, and deep brass trailer sound design.',
    assistantLead:
      'I will pace this as a three-act theatrical trailer—atmospheric world reveal, escalating combat cuts, and a final dragon hero button.',
    actions: [
      { title: 'Stage "Act I — Scorched Valley Crane"', meta: '24mm wide establishing shot, drifting ash particles' },
      { title: 'Render "Act II — Dragon Descent VFX"', meta: 'Volumetric cloud break, molten scale glow' },
      { title: 'Finish "Act III — Title Slam & Roar"', meta: 'Percussion riser, high-contrast silhouette cut' },
    ],
  },
  'micro-drama-movie-149': {
    title: 'Shadow Legacy',
    subtitle: '9:16 Neo-Noir Action Drama',
    prompt:
      'Direct a tense 9:16 neo-noir thriller scene titled "Shadow Legacy": a hooded investigator steps out of a rain-soaked neon alley into an abandoned parking garage where a rival syndicate waits beside idling headlights. Use tight over-the-shoulder tracking, slick wet-asphalt reflections, and crisp chiaroscuro shadows slicing across determined eyes.',
    promptExtra:
      'Low-key tungsten and cyan practical lighting, subtle anamorphic flare from car beams, 35mm handheld micro-jitters, muted desaturated noir grade with deep obsidian blacks.',
    assistantLead:
      'I will keep the wet-concrete lighting continuity locked across every reverse angle so the standoff builds genuine thriller tension.',
    actions: [
      { title: 'Block "Rain-Alley Entrance Track"', meta: 'Low-angle Steadicam follow, puddle mirror glare' },
      { title: 'Light "Headlight Chiaroscuro Standoff"', meta: '4:1 rim-light ratio, drifting rain mist' },
      { title: 'Mix "Sub-Bass Thriller Bed"', meta: 'Rain ambience + tight heartbeat percussion' },
    ],
  },
  'micro-drama-movie-147': {
    title: 'Micro Drama · Boarding Room',
    subtitle: '16:9 Emotional Relationship Drama',
    prompt:
      'Film an intimate 16:9 serialized drama confrontation inside a warm late-afternoon apartment living room: two estranged siblings argue quietly over an unopened letter left on a wooden dining table. Start with a slow lateral dolly past sheer sunlit curtains, holding on subtle micro-expressions, trembling hands, and charged silence between dialogue beats.',
    promptExtra:
      'Naturalistic window key light, 50mm prime lens at f/1.8, gentle film grain, warm kodak-inspired skin tones, and restrained observational camera movement.',
    assistantLead:
      'I will structure natural shot-reverse-shot coverage with consistent eye-lines and delicate emotional pacing.',
    actions: [
      { title: 'Frame "Curtain Dolly Establishing"', meta: 'Soft afternoon shafts, tactile wooden table texture' },
      { title: 'Hold "Close-Up Emotional Beats"', meta: '50mm f/1.8 portrait focus pull on micro-expressions' },
      { title: 'Cut "Unopened Letter Cliffhanger"', meta: 'Rack focus from face to paper seal' },
    ],
  },
  'micro-drama-movie-140': {
    title: 'Baby Dragon · Sanctuary Scene',
    subtitle: '16:9 Fantasy Adventure Scene',
    prompt:
      'Direct a heartwarming 16:9 fantasy cinema scene where a young apprentice discovers a newly hatched baby dragon curled inside a mossy stone alcove lit by sunbeams through a forest canopy. Glide in on a gentle macro jib shot as iridescent emerald scales shimmer, wisps of golden smoke curl from its nostrils, and the creature tilts its head curiously toward an outstretched hand.',
    promptExtra:
      'Painterly natural sunlight, subsurface scattering on translucent wings, floating forest dust motes, 35mm cinematic bokeh, and gentle orchestral woodwind score.',
    assistantLead:
      'I will balance lifelike creature textures with warm storybook cinematography so the discovery feels magical and tactile.',
    actions: [
      { title: 'Render "Sunlit Moss Alcove Reveal"', meta: 'Volumetric canopy rays, gentle crane descent' },
      { title: 'Animate "Hatchling Curiosity Beat"', meta: 'Expressive blink, wing flutter & ember puff' },
      { title: 'Grade "Enchanted Forest Palette"', meta: 'Emerald foliage + warm golden rim highlights' },
    ],
  },
  'experimental-vfx-133': {
    title: 'Kesatria · Dawn Duel',
    subtitle: '16:9 Historical Action Cinema',
    prompt:
      'Shoot a 16:9 historical action drama scene featuring an Indonesian archipelago knight ("Kesatria") drawing a carved ceremonial blade in a bamboo grove shrouded in dawn fog. Track smoothly from a low ground-level leaf sweep into a crisp sword-clash sequence with flying bamboo splinters and shafts of amber sunrise breaking through the mist.',
    promptExtra:
      'Shot on wide-to-medium anamorphic primes, high-shutter combat clarity, atmospheric ground haze, warm golden dawn contrast, and metallic blade-clash foley.',
    assistantLead:
      'I will choreograph the bamboo-grove confrontation with crisp weapon arcs and cinematic dawn backlighting.',
    actions: [
      { title: 'Stage "Misty Bamboo Grove Walk"', meta: 'Low tracking shot through drifting dawn fog' },
      { title: 'Choreograph "Blade Draw & Clash"', meta: 'Crisp shutter speed, splinter particle bursts' },
      { title: 'Finish "Golden Sunrise Hero Frame"', meta: 'Backlit silhouette with swirling bamboo leaves' },
    ],
  },
  'experimental-vfx-94': {
    title: 'Dragon Series · Citadel Siege',
    subtitle: '16:9 High-Fantasy Episodic Drama',
    prompt:
      'Direct a widescreen 16:9 fantasy series cold-open: a winged fire dragon banks sharply between crumbling stone watchtowers as archers scramble across rain-slicked battlements below. Combine sweeping aerial tracking shots with grounded handheld soldier reactions bathed in roaring orange flame reflections.',
    promptExtra:
      'Rich dark-fantasy atmospheric haze, dynamic interactive firelight on wet stone and armor, dramatic slow-motion ember bursts, and theatrical surround rumble.',
    assistantLead:
      'I will intercut soaring aerial dragon passes with grounded human-scale tension on the fortress wall.',
    actions: [
      { title: 'Animate "Citadel Aerial Swoop"', meta: 'Wide tracking camera diving past stone battlements' },
      { title: 'Light "Interactive Flame Reflections"', meta: 'Warm orange firelight flickering across wet armor' },
      { title: 'Cut "Episodic Cold-Open Climax"', meta: 'Breath-of-fire reveal into crisp smash black' },
    ],
  },
  'experimental-vfx-110': {
    title: 'Lift Fighting · Close Quarters',
    subtitle: '9:16 Action Choreography Scene',
    prompt:
      'Direct a kinetic 9:16 single-location action sequence inside a claustrophobic brushed-steel elevator as flickering overhead fluorescent panels illuminate a tight martial-arts brawl. Use agile handheld Whip-Pans, reflected punches in the mirrored elevator wall, and sharp speed-ramped impacts as floor numbers tick rapidly upward.',
    promptExtra:
      'Cool industrial green-teal fluorescent grade, 24mm wide close-quarters lens, reactive camera impact shake, crisp cloth and metal foley.',
    assistantLead:
      'I will keep spatial geography tight inside the elevator cab so every strike and mirror reflection reads clearly.',
    actions: [
      { title: 'Block "Confined Elevator Choreography"', meta: '24mm close-quarters handheld camera rig' },
      { title: 'Time "Fluorescent Flicker Beats"', meta: 'High-contrast metallic reflections + impact ramps' },
      { title: 'Cut "Door-Ding Finale Reveal"', meta: 'Sudden stillness as steel doors slide open' },
    ],
  },
  'experimental-vfx-96': {
    title: 'Duel Sequence · Warehouse Clash',
    subtitle: '16:9 Martial Arts Action Film',
    prompt:
      'Film a 16:9 modern martial-arts duel inside an industrial warehouse pierced by shafts of dusty skylight. Follow two agile fighters weaving around steel pillars in a continuous fluid tracking shot, highlighting crisp footwork, sweeping kicks that kick up concrete dust, and a decisive slow-motion parry.',
    promptExtra:
      'Naturalistic gritty cinema grade, 35mm Steadicam orbital coverage, 45-degree shutter crispness for combat strikes, and tactile room acoustics.',
    assistantLead:
      'I will build fluid one-take combat energy with clean strike readability and atmospheric warehouse lighting.',
    actions: [
      { title: 'Choreograph "Orbital Combat One-Take"', meta: '35mm Steadicam circling steel pillars' },
      { title: 'Simulate "Concrete Dust & Impact"', meta: 'High-shutter footwork + slow-mo parry peak' },
      { title: 'Grade "Gritty Daylight Warehouse"', meta: 'Dusty overhead shafts + cool slate shadows' },
    ],
  },

  // =========================================================================
  // SCI-FI & VFX (Filmmaking — Sci-Fi & VFX)
  // =========================================================================
  'experimental-vfx-134': {
    title: 'Jakarta 2035 · Neon Skyline',
    subtitle: '9:16 Futuristic Sci-Fi Worldbuilding',
    prompt:
      'Direct a breathtaking 9:16 sci-fi establishing reel of Jakarta in the year 2035: towering glass skyscrapers wrapped in vertical sky-gardens and holographic Bahasa billboards rise around the Bundaran HI monument while sleek autonomous sky-trams glide overhead at blue hour. Open with an ascending drone reveal through luminous rain mist.',
    promptExtra:
      'Photorealistic architectural VFX, cyber-tropical blue-hour atmosphere, glowing wet street reflections, crisp volumetric cloud depth, and futuristic synth swell.',
    assistantLead:
      'I will anchor futuristic megastructures onto recognizable Jakarta landmarks so the world feels grounded yet awe-inspiring.',
    actions: [
      { title: 'Build "Bundaran HI 2035 Skyline"', meta: 'Vertical sky-gardens + holographic glass facades' },
      { title: 'Animate "Autonomous Sky-Tram Lanes"', meta: 'Layered aerial traffic with light-trail motion blur' },
      { title: 'Grade "Blue-Hour Tropical Sci-Fi"', meta: 'Cyan twilight mist + warm neon street bounce' },
    ],
  },
  'experimental-vfx-135': {
    title: 'KAI · Above the Clouds',
    subtitle: '9:16 Surreal Railway Cinema',
    prompt:
      'Create a dreamlike 9:16 cinematic VFX shot of a sleek Indonesian express train gliding along a floating steel viaduct suspended high above a vast golden sea of sunlit cumulus clouds. Track beside the gleaming train cars from an aerial perspective as soft cloud wisps part around the speeding locomotive.',
    promptExtra:
      'Golden-hour rim sunlight, photorealistic cloud fluid interaction, smooth aerial parallel tracking, warm pastel sky palette, and serene ambient rail hum.',
    assistantLead:
      'I will blend photorealistic train surface reflections with billowing volumetric clouds for a Studio-Ghibli-meets-live-action feel.',
    actions: [
      { title: 'Track "Parallel Aerial Cloud Glide"', meta: 'Smooth drone follow beside speeding carriages' },
      { title: 'Simulate "Locomotive Cloud Wake"', meta: 'Volumetric mist curling past train windows' },
      { title: 'Grade "Golden Horizon Atmosphere"', meta: 'Warm sunlit highlights + soft aerial haze' },
    ],
  },
  'experimental-vfx-128': {
    title: 'TransJakarta · Hyper-Transit',
    subtitle: '9:16 Urban Mobility VFX',
    prompt:
      'Produce a sleek 9:16 urban VFX showcase turning a bustling Jakarta busway corridor into a seamless kinetic transit sequence: a gleaming TransJakarta bus surges forward as time-lapsed city light trails stream past elevated glass stations and rain-washed overpasses transform into glowing ribbons of motion.',
    promptExtra:
      'Dynamic speed-ramped tracking shots, crisp specular chrome reflections, cool twilight asphalt contrasted against signature blue-and-white livery.',
    assistantLead:
      'I will pair real-world city geometry with crisp speed-ramp motion trails for an energetic urban identity film.',
    actions: [
      { title: 'Stage "Corridor Speed-Ramp Tracking"', meta: 'Low bumper-level forward glide + motion blur' },
      { title: 'Composite "City Light-Trail Ribbons"', meta: 'Twilight headlight streaks around elevated stops' },
      { title: 'Polish "Livery Specular Pass"', meta: 'Clean glass reflections and crisp motion grade' },
    ],
  },
  'experimental-vfx-123': {
    title: 'KAI · Under the Sea',
    subtitle: '9:16 Underwater Tunnel Cinema',
    prompt:
      'Direct a mesmerizing 9:16 sci-fi transit film of a passenger train gliding smoothly through a transparent arched glass tunnel deep beneath a turquoise coral ocean. Capture dappled underwater caustics dancing across interior seats as manta rays, sea turtles, and shimmering schools of fish drift overhead past the curved glass.',
    promptExtra:
      'Refractive underwater caustic lighting, deep aquamarine color harmony, smooth interior-to-exterior push through the glass dome, tranquil sub-aquatic soundscape.',
    assistantLead:
      'I will layer refractive ocean caustics inside the carriage while keeping marine life movement graceful and photorealistic.',
    actions: [
      { title: 'Build "Subsea Glass Tunnel Geometry"', meta: 'Curved acrylic refraction + coral reef backdrop' },
      { title: 'Animate "Manta Ray & Reef Flyover"', meta: 'Slow graceful marine parallax above the train' },
      { title: 'Light "Moving Water Caustics"', meta: 'Shimmering cyan light patterns across cabin seats' },
    ],
  },
  'experimental-vfx-102': {
    title: 'Surreal Street Market Drop',
    subtitle: '9:16 Viral Mixed-Reality VFX',
    prompt:
      'Create a scroll-stopping 9:16 faux-documentary VFX reel shot like an iPhone street clip: pedestrians pause and pull out their phones as a colossal, hyper-realistic luxury product box hovers silently above a busy urban crosswalk before unfolding mid-air in a shower of metallic confetti.',
    promptExtra:
      'Authentic handheld smartphone camera jitter, natural overcast daylight match-move, realistic shadow cast on asphalt, and subtle street-crowd reactions.',
    assistantLead:
      'I will match natural handheld camera tracking and ambient street lighting so the impossible VFX centerpiece feels completely real.',
    actions: [
      { title: 'Track "Handheld Street Match-Move"', meta: 'Realistic smartphone stabilization & focus hunt' },
      { title: 'Composite "Oversized Hovering Reveal"', meta: 'Matched daylight shadows on wet crosswalk' },
      { title: 'Add "Crowd Reaction Framing"', meta: 'Foreground silhouettes filming upward' },
    ],
  },
  'experimental-vfx-119': {
    title: 'Miniature Eid Memories',
    subtitle: '9:16 Tilt-Shift Nostalgia Diorama',
    prompt:
      'Craft a nostalgic 9:16 tilt-shift miniature animation bringing childhood Eid homecoming memories to life inside a handcrafted tabletop diorama: tiny illuminated village houses, woven ketupat stalls, glowing paper lanterns, and miniature family cars winding down a sunlit kampung road.',
    promptExtra:
      'Shallow tilt-shift macro optics, warm nostalgic amber dusk glow, stop-motion-inspired delicate character movement, and rich clay-and-wood miniature textures.',
    assistantLead:
      'I will stage each childhood Eid memory as a tactile illuminated miniature world with gentle macro camera glides.',
    actions: [
      { title: 'Craft "Kampung Tilt-Shift Diorama"', meta: 'Macro shallow focus, miniature warm streetlamps' },
      { title: 'Animate "Mudik Homecoming Convoy"', meta: 'Tiny glowing headlights winding through rice terraces' },
      { title: 'Warm "Lantern Dusk Color Pass"', meta: 'Golden nostalgia glow + subtle film bloom' },
    ],
  },
  'experimental-vfx-111': {
    title: 'Rolex Rescue · Anti-Hero VFX',
    subtitle: '9:16 Pop-Culture VFX Mashup',
    prompt:
      'Direct a cheeky 9:16 live-action VFX mashup: a shattered luxury steel chronograph lies cracked on a workbench until a wisecracking red-suited masked vigilante leans into frame, snaps his fingers, and reassembles every tiny sapphire shard and golden gear in mid-air with sparkling metallic precision.',
    promptExtra:
      'Sharp studio macro lighting, reverse-shatter rigid-body simulation, crisp watchmaker glint on the bezel, punchy comedic timing and metallic snap SFX.',
    assistantLead:
      'I will combine playful character body language with ultra-crisp horological macro VFX as the watch snaps back together.',
    actions: [
      { title: 'Simulate "Reverse-Shatter Gear Reassembly"', meta: 'Floating sapphire crystal & micro-gears snap lock' },
      { title: 'Block "Red-Suit Comedic Reveal"', meta: 'Expressive hand gestures + snappy camera whip' },
      { title: 'Polish "Chronograph Specular Glint"', meta: 'Macro hero turntable on restored watch face' },
    ],
  },
  'experimental-vfx-89': {
    title: 'Kinetic Light Portal',
    subtitle: '9:16 Abstract VFX Transition',
    prompt:
      'Design a hypnotic 9:16 visual effects sequence where a lone traveler stands before a towering ring of liquid chrome and swirling violet plasma in an empty salt flat at dusk. Push the camera smoothly through the rippling portal as gravity reverses and glowing mineral shards lift effortlessly into the night sky.',
    promptExtra:
      'Physically based mirror reflections on liquid metal, clean volumetric plasma glow, slow symmetrical push-in, deep twilight horizon contrast.',
    assistantLead:
      'I will craft a seamless portal transition with convincing chrome reflections and weightless atmospheric particles.',
    actions: [
      { title: 'Render "Liquid Chrome Portal Ring"', meta: 'Ray-traced horizon reflection + plasma edge' },
      { title: 'Simulate "Zero-Gravity Shard Drift"', meta: 'Floating salt-flat stones ascending slowly' },
      { title: 'Push "Symmetrical Portal Entry"', meta: 'Smooth forward dolly through light distortion' },
    ],
  },
  'experimental-vfx-129': {
    title: 'Morphing Reality Cut',
    subtitle: '9:16 Seamless AI Match-Cut VFX',
    prompt:
      'Direct a fast-paced 9:16 visual morph reel stitching four contrasting environments—a rain-soaked neon street, a minimalist white gallery, a desert dune ridge, and a misty alpine peak—through continuous spinning camera match-cuts anchored on a single walking protagonist.',
    promptExtra:
      'Seamless rotational whip transitions, matched center-frame subject scale, distinct tailored color palettes per world, rhythmic percussive edit cadence.',
    assistantLead:
      'I will lock the protagonist’s center-frame silhouette across every world-swap so each transition lands cleanly on the beat.',
    actions: [
      { title: 'Lock "Center-Frame Subject Anchor"', meta: 'Consistent walking cadence across 4 scenes' },
      { title: 'Blend "Rotational Whip Morphs"', meta: 'Motion-blurred environment swaps on beat' },
      { title: 'Balance "Four-World Color Arc"', meta: 'Neon night → gallery white → desert gold → alpine mist' },
    ],
  },
  'experimental-vfx-137': {
    title: 'CCTV Chaos · Security Feed',
    subtitle: '9:16 Found-Footage VFX Comedy',
    prompt:
      'Create a wildly entertaining 9:16 fixed-angle CCTV security-camera VFX clip inside a quiet late-night convenience store: timestamp numbers tick calmly in the corner until an unexpected surreal stampede of runaway objects and glowing portals erupts across the snack aisles, leaving the night clerk staring in disbelief.',
    promptExtra:
      'Authentic wide-angle fisheye ceiling mount, subtle low-bitrate security-cam scanlines, crisp timestamp overlay, fluorescent aisle lighting.',
    assistantLead:
      'I will preserve the deadpan fixed ceiling camera perspective so the escalating absurdity hits with maximum comedic surprise.',
    actions: [
      { title: 'Set "Fixed Fisheye CCTV Angle"', meta: 'Authentic ceiling mount, fluorescent store lighting' },
      { title: 'Simulate "Aisle Chaos Escalation"', meta: 'Physics-accurate flying snack boxes & reaction' },
      { title: 'Overlay "Subtle Security HUD"', meta: 'Clean corner timecode + subtle sensor grain' },
    ],
  },
  'experimental-vfx-131': {
    title: 'Absurd City · Gravity Fold',
    subtitle: '9:16 Surreal Architectural Cinema',
    prompt:
      'Direct an Inception-inspired 9:16 surreal cityscape where downtown high-rises bend smoothly overhead into a vaulted architectural sky while commuter traffic drives effortlessly upside-down above sunlit boulevards. Glide down the central avenue on a slow wide-angle gimbal shot as pedestrians stroll calmly beneath the folding horizon.',
    promptExtra:
      'Crisp architectural daylight shadows, ultra-wide 16mm rectilinear perspective, seamless sky-bridge geometry, clean realistic concrete and glass materials.',
    assistantLead:
      'I will keep the street-level daylight completely natural so the folding city horizon feels breathtakingly tangible.',
    actions: [
      { title: 'Construct "Folding Skyline Geometry"', meta: 'Curved concrete boulevards + mirrored glass towers' },
      { title: 'Glide "16mm Central Avenue Track"', meta: 'Slow steady forward dolly through pedestrians' },
      { title: 'Match "Architectural Daylight Shadows"', meta: 'Consistent midday sun across inverted planes' },
    ],
  },
  'experimental-vfx-99': {
    title: 'Giant LEGO Statue Collapse',
    subtitle: '9:16 Rigid-Body Physics VFX',
    prompt:
      'Produce a hyper-realistic 9:16 museum-gallery physics VFX clip: a curious child gently taps the base of a towering 3-meter sculpture built from thousands of glossy colorful LEGO bricks, triggering a spectacular slow-motion cascade as tens of thousands of individual plastic bricks clatter and bounce across polished terrazzo floors.',
    promptExtra:
      'Photorealistic ABS plastic specular sheen, dense rigid-body brick shatter simulation, handheld gallery bystander perspective, crisp clattering brick acoustics.',
    assistantLead:
      'I will tune the rigid-body simulation so every tumbling brick carries believable weight, bounce, and shiny plastic reflections.',
    actions: [
      { title: 'Build "3-Meter Brick Sculpture Asset"', meta: 'Glossy multicolored ABS stud detail' },
      { title: 'Simulate "10,000-Brick Cascade"', meta: 'Progressive structural fracture + terrazzo bounce' },
      { title: 'Capture "Gallery Bystander Handheld"', meta: 'Natural museum lighting + realistic reaction timing' },
    ],
  },
  'experimental-vfx-116': {
    title: 'Neon Ball Pit Avalanche',
    subtitle: '9:16 Playful Crowd-Sim VFX',
    prompt:
      'Direct a vibrant 9:16 surreal urban VFX clip where an escalator inside a modern glass atrium suddenly overflows with an endless pastel tidal wave of glossy play-balls tumbling down the steps and bouncing joyfully past surprised shoppers.',
    promptExtra:
      'Bright architectural skylight illumination, buoyant multi-thousand sphere physics, crisp glossy reflections, upbeat kinetic pacing.',
    assistantLead:
      'I will dial in buoyant sphere collisions and natural atrium reflections for a playful, eye-catching viral loop.',
    actions: [
      { title: 'Simulate "Escalator Sphere Flood"', meta: 'Dense pastel ball-pit fluid dynamics' },
      { title: 'Light "Atrium Skylight Speculars"', meta: 'Soft daylight bounce across glossy spheres' },
      { title: 'Time "Shopper Surprise Beat"', meta: 'Handheld pan following the bouncing wave' },
    ],
  },
  'experimental-vfx-112': {
    title: 'Bola Chaos · Stadium Frenzy',
    subtitle: '9:16 Sports Surrealism VFX',
    prompt:
      'Create an explosive 9:16 sports VFX spectacle inside a floodlit street-football arena: a single power-kick splits the soccer ball into dozens of glowing kinetic spheres ricocheting off chain-link fences, concrete walls, and goalposts in synchronized slow-motion shockwaves.',
    promptExtra:
      'High-speed 240fps ramp on impact, stadium floodlight lens streaks, subtle dust bursts on concrete bounces, punchy percussion hits.',
    assistantLead:
      'I will choreograph the shockwave kick and multi-ball ricochet so the motion feels electric and physically punchy.',
    actions: [
      { title: 'Ramp "Impact Kick Shockwave"', meta: '240fps slow-mo foot-to-ball compression' },
      { title: 'Simulate "Multi-Ball Ricochet"', meta: 'Chain-link fence vibrations + chalk dust puffs' },
      { title: 'Light "Night Floodlight Flare"', meta: 'Cool stadium rim glow + gritty asphalt contrast' },
    ],
  },
  'experimental-vfx-114': {
    title: 'Bank Mandiri · Living Architecture',
    subtitle: '9:16 Fintech Brand VFX',
    prompt:
      'Direct a prestigious 9:16 corporate brand VFX spot in front of an iconic Jakarta financial district plaza: ribbons of metallic gold and deep navy blue light weave smoothly across glass towers and assemble into a luminous holographic emblem floating cleanly above the modern skyline at sunset.',
    promptExtra:
      'Refined corporate architectural photography, brushed-gold and sapphire reflections, graceful sweeping drone orbit, polished executive color grade.',
    assistantLead:
      'I will pair authoritative architectural camera movement with restrained gold-and-navy holographic motion graphics.',
    actions: [
      { title: 'Orbit "Financial District Glass Plaza"', meta: 'Smooth sunset aerial sweep across skyscrapers' },
      { title: 'Weave "Gold & Navy Light Ribbons"', meta: 'Clean architectural reflection tracking' },
      { title: 'Lock "Skyline Brand Emblem Reveal"', meta: 'Crisp corporate color grade + subtle bloom' },
    ],
  },
  'experimental-vfx-104': {
    title: 'Kopi Kenangan · Giant Cup Pop-Up',
    subtitle: '9:16 FOOH Coffee Branding VFX',
    prompt:
      'Produce a bold 9:16 fake-out-of-home (FOOH) coffee brand spectacle on a sunny Jakarta street corner: a towering iced palm-sugar latte cup rises beside a glass office tower as swirling espresso crema, melting ice cubes, and caramel ribbons cascade magically inside its translucent walls.',
    promptExtra:
      'Crisp tropical morning daylight, realistic condensation droplets on giant cup walls, believable pedestrian scale reference, snappy viral hook.',
    assistantLead:
      'I will match authentic tropical street sunlight and glass condensation so the monumental iced coffee feels irresistibly tangible.',
    actions: [
      { title: 'Place "Monumental Iced Latte Cup"', meta: 'Matched sidewalk perspective & midday shadow' },
      { title: 'Simulate "Espresso & Milk Swirl"', meta: 'Dynamic liquid marbling + floating ice cubes' },
      { title: 'Finish "Condensation & Street Reaction"', meta: 'Glistening droplets + pedestrian foreground pass' },
    ],
  },
  'experimental-vfx-118': {
    title: 'Eid Mubarak · Living Illustration',
    subtitle: '9:16 Festive Cultural Animation',
    prompt:
      'Animate a richly detailed 9:16 painterly Eid Mubarak greeting film: crescent moons, glowing brass Moroccan lanterns, geometric mosque silhouettes, and drifting golden fireworks unfold like an illuminated pop-up storybook over a serene indigo Indonesian twilight sky.',
    promptExtra:
      'Warm emerald-and-gold festive palette, delicate parallax depth layers, gentle glowing lantern bokeh, smooth meditative camera tilt-up.',
    assistantLead:
      'I will layer ornate festive motifs with soft lantern light bloom for a warm, shareable holiday film.',
    actions: [
      { title: 'Layer "Mosque & Lantern Parallax"', meta: 'Warm gold-leaf highlights on deep indigo sky' },
      { title: 'Animate "Drifting Crescent & Sparkles"', meta: 'Gentle glowing fireflies & silk ribbon motion' },
      { title: 'Reveal "Festive Greeting Finale"', meta: 'Soft bloom lift into balanced end-frame' },
    ],
  },
  'experimental-vfx-91': {
    title: 'Midnight Express · Tunnel Warp',
    subtitle: '9:16 Atmospheric Railway Film',
    prompt:
      'Direct a moody 9:16 cinematic train journey: glide from a misty rain-streaked platform alongside a sleek silver commuter train as it accelerates into a tunnel lined with rhythmic amber sodium lamps, morphing into streaks of golden hyper-speed light outside the passenger window.',
    promptExtra:
      'Moody cinema grade with teal shadows and warm amber lamps, rain droplets clinging to window glass, rhythmic rail-click audio cadence.',
    assistantLead:
      'I will build a hypnotic transition from quiet rainy-platform stillness into rhythmic high-speed tunnel motion.',
    actions: [
      { title: 'Frame "Rain-Streaked Platform Departure"', meta: 'Shallow 50mm reflection on wet carriage steel' },
      { title: 'Accelerate "Amber Tunnel Light Streaks"', meta: 'Long-exposure motion blur along tunnel walls' },
      { title: 'Hold "Window Silhouette Contemplation"', meta: 'Soft warm light pulses across glass droplets' },
    ],
  },
  'experimental-vfx-101': {
    title: 'LEGO CR7 · Brick Bicycle Kick',
    subtitle: '9:16 Stop-Motion Sports VFX',
    prompt:
      'Create a hyper-detailed 9:16 miniature LEGO football spectacle inside a brick-built floodlit stadium: a miniature brick striker leaps mid-air for an acrobatic overhead bicycle kick, launching a faceted brick soccer ball past a diving keeper as thousands of tiny colorful minifigure fans erupt in the stands.',
    promptExtra:
      'Tactile stop-motion 18fps-accented charm blended with crisp modern macro depth of field, authentic glossy plastic studs, stadium spotlight flares.',
    assistantLead:
      'I will balance tactile brick-built charm with dynamic sports camera sweeps around the overhead kick.',
    actions: [
      { title: 'Build "Brick Stadium & Minifig Crowd"', meta: 'Macro tilt-shift focus + floodlight glow' },
      { title: 'Animate "Acrobatic Overhead Kick"', meta: '360-degree bullet-time orbit at peak strike' },
      { title: 'Celebrate "Confetti Stud Explosion"', meta: 'Tiny translucent brick confetti raining down' },
    ],
  },
  'experimental-vfx-107': {
    title: 'Starbucks · City Rooftop Pour',
    subtitle: '9:16 Architectural Coffee FOOH',
    prompt:
      'Stage a striking 9:16 out-of-home coffee installation atop a modern glass storefront: a sculptural emerald-green coffee vessel tilts gracefully to pour a velvety ribbon of dark roast espresso into an oversized ceramic mug resting on the plaza below while aromatic steam curls upward into crisp morning air.',
    promptExtra:
      'Clean architectural daylight, glossy dark-roast fluid simulation, drifting translucent steam plumes, realistic urban reflections.',
    assistantLead:
      'I will anchor the surreal rooftop pour in crisp real-world daylight and physically believable fluid dynamics.',
    actions: [
      { title: 'Simulate "Velvety Rooftop Espresso Pour"', meta: 'Thick crema ribbon + glistening splash ripples' },
      { title: 'Layer "Rising Morning Steam Plumes"', meta: 'Backlit sunlit vapor drifting past glass facades' },
      { title: 'Match "Plaza Camera Tracking"', meta: 'Handheld street-level upward tilt' },
    ],
  },
  'experimental-vfx-95': {
    title: 'LA Crowd · Urban Time-Slice',
    subtitle: '9:16 Editorial Street VFX',
    prompt:
      'Direct a bold 9:16 fashion-editorial street VFX sequence down a sun-drenched Los Angeles palm boulevard: a sharply styled protagonist walks briskly at normal speed toward camera while the surrounding street crowd, passing convertibles, and fluttering palm fronds warp into crisp hyper-lapse trails.',
    promptExtra:
      'Warm California golden-hour sunlight, high-contrast film grain, razor-sharp subject isolation against streaky motion-blurred traffic.',
    assistantLead:
      'I will lock clean subject-speed separation so the protagonist commands the frame while the boulevard races around them.',
    actions: [
      { title: 'Isolate "Normal-Speed Protagonist Walk"', meta: 'Crisp Steadicam reverse track on 35mm lens' },
      { title: 'Stretch "Boulevard Hyper-Lapse Crowd"', meta: 'Smooth time-slice trails on cars & pedestrians' },
      { title: 'Grade "Sun-Drenched LA Film Look"', meta: 'Warm golden highlights + teal palm shadows' },
    ],
  },
  'experimental-vfx-124': {
    title: 'Lebaran 1446 H · Golden Homecoming',
    subtitle: '9:16 Festive Cinematic Short',
    prompt:
      'Create a heartwarming 9:16 Lebaran celebration sequence opening on glowing ketupat ornaments swaying softly in a warm breeze, transitioning seamlessly into a family courtyard lit by fairy lights, laughter over festive dishes, and golden lanterns floating peacefully into a starry twilight sky.',
    promptExtra:
      'Warm celebratory candlelit palette, gentle handheld intimacy, rich gold-and-emerald textiles, soft cinematic lens bloom.',
    assistantLead:
      'I will weave intimate cultural details and warm lantern lighting into a cohesive, emotional festive reel.',
    actions: [
      { title: 'Open "Swaying Ketupat & Lantern Macro"', meta: 'Soft twilight bokeh + warm gold rim light' },
      { title: 'Transition "Courtyard Family Gathering"', meta: 'Fluid light-leak wipe into festive table glow' },
      { title: 'Close "Sky Lantern Ascent"', meta: 'Slow tilt-up into shimmering night sky' },
    ],
  },
  'experimental-vfx-90': {
    title: 'Coffee Bean · Zero-G Roast',
    subtitle: '9:16 Macro Coffee Brand VFX',
    prompt:
      'Direct a sumptuous 9:16 macro brand piece for an artisan roastery: freshly roasted dark espresso beans tumble in weightless slow-motion through golden volumetric light beams, cracking open mid-air to release fine swirling coffee grounds that coalesce into a steaming porcelain cup.',
    promptExtra:
      'Ultra-crisp 100mm macro optics, rich dark-chocolate and burnished-amber palette, floating aromatic dust motes, deep tactile sound texture.',
    assistantLead:
      'I will showcase every oily ridge on the roasted beans before morphing the suspended grounds smoothly into the hero pour.',
    actions: [
      { title: 'Simulate "Zero-G Tumbling Roast Beans"', meta: '100mm macro slow-motion, warm amber rim glow' },
      { title: 'Morph "Mid-Air Grounds to Espresso"', meta: 'Particle-to-fluid transition in dark studio space' },
      { title: 'Reveal "Steaming Hero Cup Lockup"', meta: 'Crema shimmer + dramatic overhead spot' },
    ],
  },
  'experimental-vfx-97': {
    title: 'AI Time Travel · Era Shift',
    subtitle: '9:16 Sci-Fi Temporal Cinema',
    prompt:
      'Direct a captivating 9:16 time-travel cinema reel following a traveler standing on a cobblestone square as centuries ripple visibly past them—from candlelit colonial carriages to bustling mid-century vintage autos to gleaming holographic hover-craft—in one uninterrupted forward camera glide.',
    promptExtra:
      'Seamless architectural morphing across eras, evolving color temperature from sepia warmth to crisp cyber-cyan, anchored center-frame traveler.',
    assistantLead:
      'I will keep the horizon line and traveler anchored across every historical transition so the centuries flow seamlessly.',
    actions: [
      { title: 'Anchor "Continuous Forward Camera Glide"', meta: 'Locked horizon across three historical eras' },
      { title: 'Morph "Architecture & Crowd Evolution"', meta: 'Carriages → vintage sedans → futuristic skyways' },
      { title: 'Shift "Temporal Color Temperature"', meta: 'Warm archival sepia into electric future twilight' },
    ],
  },
  'experimental-vfx-130': {
    title: 'Chromatic Glitch Pulse',
    subtitle: '9:16 Experimental Motion Art',
    prompt:
      'Craft an avant-garde 9:16 experimental cinema piece where a dancer in sleek monochrome streetwear moves through a pitch-black void sliced by razor-thin laser light curtains, leaving luminous chromatic motion echoes that trail and shatter into sparkling prisms on every beat.',
    promptExtra:
      'High-contrast obsidian studio void, precise volumetric laser planes, subtle RGB prism echoes, sharp rhythmic edit cadence.',
    assistantLead:
      'I will pair crisp silhouette choreography with restrained laser-light prism trails for an editorial gallery aesthetic.',
    actions: [
      { title: 'Stage "Laser-Plane Void Silhouette"', meta: 'Razor-sharp beam contrast in dark studio' },
      { title: 'Trail "Chromatic Motion Echoes"', meta: 'Beat-locked translucent ghost frames' },
      { title: 'Finish "Prism Shatter Climax"', meta: 'Clean strobe cut into minimal dark end-frame' },
    ],
  },
  'experimental-vfx-125': {
    title: 'Living Ink · Animated Tattoo',
    subtitle: '9:16 Skin-Tracked VFX Fashion',
    prompt:
      'Direct a mesmerizing 9:16 close-up fashion VFX sequence: intricate black-and-gold botanical and dragon ink resting on a model’s shoulder subtly awakens, with delicate inked petals blooming and golden serpentine lines gliding smoothly across skin under moody studio rim lighting.',
    promptExtra:
      'Precision 3D surface skin-tracking, realistic subsurface skin texture and pore detail, 85mm macro portrait lens, dramatic sculptural side lighting.',
    assistantLead:
      'I will keep the animated ink bonded naturally to skin curvature and lighting so the living-tattoo illusion looks uncanny.',
    actions: [
      { title: 'Track "3D Skin-Surface Mesh"', meta: 'Accurate pore texture & muscle contour lock' },
      { title: 'Animate "Botanical & Gold Ink Bloom"', meta: 'Fluid calligraphic motion across shoulder' },
      { title: 'Light "Sculptural Editorial Rim"', meta: '85mm macro lens + warm tungsten edge highlight' },
    ],
  },
  'experimental-vfx-113': {
    title: 'First-Frame World Unfold',
    subtitle: '9:16 Image-to-Video VFX Showcase',
    prompt:
      'Create a seamless 9:16 image-to-video transformation starting from a hyper-detailed still keyframe: the frozen scene breathes suddenly to life as wind ripples through fabrics, distant clouds drift across the sky, practical lamps flicker warmly, and the camera glides smoothly forward into three-dimensional depth.',
    promptExtra:
      'Faithful first-frame identity preservation, multi-plane parallax reveal, gentle organic wind physics, crisp cinematic micro-contrast.',
    assistantLead:
      'I will honor every pixel of the starting reference frame while unlocking smooth 3D parallax and living atmospheric motion.',
    actions: [
      { title: 'Preserve "Exact Keyframe Fidelity"', meta: 'Zero subject drift from initial reference plate' },
      { title: 'Unlock "Multi-Plane Camera Push"', meta: 'Smooth depth separation across foreground & sky' },
      { title: 'Add "Organic Atmospheric Life"', meta: 'Subtle cloth ripple, drifting dust & light shimmer' },
    ],
  },
  'experimental-vfx-117': {
    title: 'Whip-Zoom Seamless Transition',
    subtitle: '9:16 Dynamic Editorial Transition',
    prompt:
      'Produce an ultra-smooth 9:16 camera-transition showcase connecting a close-up iris reflection, a spinning coffee cup rim, a subway train window, and an aerial city rooftop via precision whip-zoom match-cuts with zero visible seams.',
    promptExtra:
      'Precision velocity-ramped zoom curves, matched circular framing geometry, subtle directional motion blur, crisp modern commercial color grade.',
    assistantLead:
      'I will match entry and exit focal shapes across each cut so the camera flies effortlessly from macro to aerial scale.',
    actions: [
      { title: 'Align "Circular Geometry Match-Cuts"', meta: 'Iris → cup rim → tunnel arch → rooftop helipad' },
      { title: 'Curve "Velocity-Ramped Zooms"', meta: 'Snappy whip acceleration with smooth settle' },
      { title: 'Unify "Cohesive Daylight Grade"', meta: 'Seamless exposure & white-balance bridging' },
    ],
  },
  'experimental-vfx-121': {
    title: 'Sub-Zero Freezer Reveal',
    subtitle: '16:9 Ice-Cold Beverage VFX',
    prompt:
      'Direct a crisp 16:9 commercial VFX shot inside a frost-crusted cryogenic chamber: heavy liquid-nitrogen mist cascades across dark slate as crystalline ice veins race rapidly over a chilled beverage bottle, culminating in an explosive frost burst that reveals gleaming condensation under icy sapphire rim light.',
    promptExtra:
      'Macro high-speed ice crystallization, crisp glacial cyan and silver palette, dense low-lying dry-ice fog, razor-sharp specular highlights.',
    assistantLead:
      'I will stage high-speed frost propagation and dense vapor dynamics so viewers practically feel the sub-zero chill.',
    actions: [
      { title: 'Simulate "Rapid Ice-Crystal Growth"', meta: 'Macro frost veins creeping across glass' },
      { title: 'Roll "Liquid-Nitrogen Vapor Cascade"', meta: 'Heavy cold mist spilling across dark stone' },
      { title: 'Burst "Glacial Hero Reveal"', meta: 'Crisp sapphire rim-light & droplet glisten' },
    ],
  },
  'experimental-vfx-92': {
    title: 'Sculptural Chrome Logo Reveal',
    subtitle: '16:9 3D Brand Motion Identity',
    prompt:
      'Design a 16:9 luxury broadcast brand ident: liquid mercury droplets converge across a matte obsidian monolith, pulling upward against gravity to forge a razor-sharp brushed-titanium logo illuminated by a sweeping horizon beam of indigo and white studio light.',
    promptExtra:
      'Anisotropic brushed-metal shaders, ray-traced studio light sweep, crisp 60fps fluid-to-solid morph, clean minimalist typography lockup.',
    assistantLead:
      'I will craft a restrained, architectural brand ident focused on tactile metal reflections and precise light choreography.',
    actions: [
      { title: 'Simulate "Liquid Mercury Convergence"', meta: 'High-surface-tension droplets merging smoothly' },
      { title: 'Sweep "Horizon Rim Light Pass"', meta: 'Crisp indigo-white reflection across beveled edges' },
      { title: 'Lock "Final Brand Mark Resolve"', meta: 'Clean center hold with subtle ambient sheen' },
    ],
  },
  'experimental-vfx-106': {
    title: 'Atmospheric World Vista',
    subtitle: '16:9 Cinematic Environment VFX',
    prompt:
      'Shoot a sweeping 16:9 widescreen sci-fi landscape reveal: glide low over jagged black basalt cliffs pounded by misty surf as colossal ancient monolithic rings hover silently through storm-lit coastal clouds in the distance.',
    promptExtra:
      'Epic 24mm widescreen perspective, moody Nordic coastal color palette, realistic ocean spray physics, majestic slow drone elevation.',
    assistantLead:
      'I will emphasize vast atmospheric scale and realistic coastal mist so the hovering monoliths feel monumental.',
    actions: [
      { title: 'Fly "Basalt Coast Low-Altitude Drone"', meta: '24mm wide sweep over crashing sea spray' },
      { title: 'Integrate "Distant Atmospheric Monoliths"', meta: 'Aerial perspective haze & cloud occlusion' },
      { title: 'Grade "Moody Nordic Cinema LUT"', meta: 'Deep slate sea + silver storm-cloud highlights' },
    ],
  },
  'experimental-vfx-127': {
    title: 'Creator Set · Behind the VFX',
    subtitle: '9:16 Hybrid Studio Breakdown',
    prompt:
      'Create a meta 9:16 behind-the-scenes VFX reel starting in a bright minimalist creator studio with softboxes and tripods, then peeling back reality mid-sentence as the plain backdrop dissolves seamlessly into a dramatic neon rooftop set while the creator keeps talking directly to lens.',
    promptExtra:
      'Seamless real-time set replacement wipe, authentic studio light transition into colorful night ambiance, natural creator eye-contact.',
    assistantLead:
      'I will synchronize the virtual environment swap with the creator’s gesture so the studio-to-cinema reveal feels effortless.',
    actions: [
      { title: 'Track "Creator Studio Master Shot"', meta: 'Natural handheld framing + softbox key light' },
      { title: 'Trigger "Mid-Gesture Set Dissolve"', meta: 'Seamless transition from studio cyc to neon roof' },
      { title: 'Relight "Dynamic Environment Match"', meta: 'Interactive neon rim bounce on creator shoulders' },
    ],
  },
  'experimental-vfx-109': {
    title: 'Sonic Impact · Audio-Reactive VFX',
    subtitle: '16:9 Sound-Driven Visual Experiment',
    prompt:
      'Direct a visceral 16:9 audio-reactive VFX study where every sub-bass thump and metallic synth transient visibly ripples through suspended pools of dark ferrofluid and floating glass spheres in a dimly lit architectural hall.',
    promptExtra:
      'Spiky magnetic ferrofluid simulation synced to sound waves, dramatic overhead spotlight shafts, razor-sharp 60fps micro-ripples.',
    assistantLead:
      'I will synchronize every ferrofluid spike and shockwave ripple directly to the sonic transients for maximum sensory impact.',
    actions: [
      { title: 'Sync "Ferrofluid Magnetic Spikes"', meta: 'Sub-bass reactive surface sculpting' },
      { title: 'Pulse "Glass Sphere Shockwaves"', meta: 'Refractive distortion timed to percussion hits' },
      { title: 'Light "Architectural Beam Contrast"', meta: 'Overhead volumetric cone + obsidian floor gloss' },
    ],
  },
  'experimental-vfx-126': {
    title: 'Hyper-Cut Cinema Montage',
    subtitle: '16:9 Rhythmic Visual Essay',
    prompt:
      'Assemble a gripping 16:9 high-tempo visual essay jumping across neon tunnels, speeding motorcycle headlights, rain-lashed rooftops, and silhouetted runners—bound together by aggressive directional match-cuts and anamorphic blue streaks.',
    promptExtra:
      'Fast-cut rhythmic editing, gritty 35mm night film grain, bold cyan-and-crimson contrast, energetic momentum from frame one.',
    assistantLead:
      'I will align directional camera momentum across every cut so the entire montage feels like one continuous adrenaline rush.',
    actions: [
      { title: 'Cut "Directional Velocity Sequence"', meta: 'Matched left-to-right motion across night shots' },
      { title: 'Add "Anamorphic Headlight Streaks"', meta: 'Subtle horizontal flares on wet midnight streets' },
      { title: 'Grade "Electric Night Cinema"', meta: 'Rich shadow depth + vibrant crimson-cyan pops' },
    ],
  },
  'experimental-vfx-87': {
    title: 'Gravity-Defying Urban Drift',
    subtitle: '9:16 Experimental Physics Reel',
    prompt:
      'Direct a surreal 9:16 urban dreamscape where everyday street elements—parked bicycles, glowing café signs, and rain puddles—detach gently from a quiet dusk avenue and float upward in slow synchronized choreography as a lone observer looks on.',
    promptExtra:
      'Naturalistic twilight street photography, slow poetic upward drift, accurate soft reflections on floating objects, tranquil ambient score.',
    assistantLead:
      'I will keep the street textures grounded and realistic so the quiet levitation feels poetic rather than artificial.',
    actions: [
      { title: 'Stage "Quiet Dusk Avenue Plate"', meta: 'Natural sodium streetlamps + wet curb reflections' },
      { title: 'Float "Synchronized Object Levitation"', meta: 'Slow weighted drift of urban props skyward' },
      { title: 'Frame "Observer Wonder Tilt-Up"', meta: 'Smooth gimbal tilt following floating silhouettes' },
    ],
  },
  'experimental-vfx-108': {
    title: 'Elevator Dimension Shift',
    subtitle: '9:16 Portal-Door Cinema VFX',
    prompt:
      'Create a clever 9:16 one-take VFX loop set inside a sleek brass-and-marble hotel elevator: every time the sliding doors close and chime open on a new floor, they reveal a wildly unexpected cinematic world—first a misty pine forest, next a sunlit Mediterranean sea, then a neon cyberpunk bazaar.',
    promptExtra:
      'Locked interior elevator perspective, realistic outdoor spill light flooding the brass interior on each door opening, crisp chime audio cues.',
    assistantLead:
      'I will match exterior bounce lighting into the elevator cabin each time the doors part so every world feels genuinely connected.',
    actions: [
      { title: 'Lock "Interior Elevator Framing"', meta: 'Brass trim foreground framing each world reveal' },
      { title: 'Light "Dynamic Exterior Spill"', meta: 'Forest mist → ocean sun → neon glow inside cabin' },
      { title: 'Loop "Seamless Door-Chime Cycle"', meta: 'Clean repeatable transition timing' },
    ],
  },
  'experimental-vfx-136': {
    title: 'Studio Light Sculpture',
    subtitle: '9:16 Motion-Control Light Art',
    prompt:
      'Shoot a minimalist 9:16 motion-control VFX study inside a curved cyclorama studio: sculpted ribbons of warm amber and crisp white volumetric light orbit a poised central figure, casting sweeping geometric shadows across seamless architectural walls.',
    promptExtra:
      'Precision robotic camera arc, clean gallery lighting, smooth volumetric beam falloff, refined monochrome-plus-amber palette.',
    assistantLead:
      'I will choreograph precise orbital camera motion and sculptural light arcs for an elevated art-direction film.',
    actions: [
      { title: 'Program "Robotic Orbital Arc"', meta: 'Silky-smooth motion-control sweep around subject' },
      { title: 'Sculpt "Volumetric Light Ribbons"', meta: 'Warm amber & crisp white geometric shadow play' },
      { title: 'Finish "Gallery Minimalist Grade"', meta: 'Clean tonal roll-off + fine organic grain' },
    ],
  },
  'experimental-vfx-93': {
    title: 'Avant-Garde Fashion Morph',
    subtitle: '9:16 High-Fashion VFX Campaign',
    prompt:
      'Direct a striking 9:16 high-fashion runway VFX film: a model strides confidently down a mirrored architectural corridor while her structured coat morphs mid-step from pleated liquid silk into iridescent metallic organza, trailing delicate floating fabric petals.',
    promptExtra:
      'Editorial vogue lighting, crisp cloth-simulation physics, mirrored floor reflections, cool platinum and obsidian high-fashion color grade.',
    assistantLead:
      'I will preserve natural runway stride mechanics while smoothly transforming garment shaders and fabric flow mid-walk.',
    actions: [
      { title: 'Track "Mirrored Corridor Runway Walk"', meta: 'Low-angle editorial tracking with floor reflections' },
      { title: 'Simulate "Mid-Stride Fabric Morph"', meta: 'Pleated silk seamlessly rippling into metallic organza' },
      { title: 'Grade "Platinum Editorial Look"', meta: 'High-fashion contrast + luminous fabric speculars' },
    ],
  },

  // =========================================================================
  // 3D & ANIME (Filmmaking — 3D & Anime)
  // =========================================================================
  '3d-animation-3': {
    title: 'Worlds of Robot',
    subtitle: '9:16 Stylized 3D Sci-Fi Short',
    prompt:
      'Create a charming, Pixar-grade 9:16 3D animated sci-fi short set in a sprawling sunlit scrap-metal metropolis inhabited by expressive miniature robots. Follow a wide-eyed rusted helper bot scurrying across towering gear-bridges and glowing neon repair bays, discovering a tiny glowing sprout thriving inside an old turbine.',
    promptExtra:
      'Physically based worn-paint metal shaders, warm global illumination, expressive mechanical eye-shutter animation, shallow miniature bokeh.',
    assistantLead:
      'I will balance intricate weathered-metal worldbuilding with warm, emotionally readable character animation on the hero bot.',
    actions: [
      { title: 'Look-Dev "Weathered Helper Bot"', meta: 'Chipped enamel paint, expressive glowing optics' },
      { title: 'Stage "Clockwork City Crane Shot"', meta: 'Sweeping dive through sunlit gear-bridges' },
      { title: 'Animate "Glowing Sprout Discovery"', meta: 'Gentle head tilt + warm rim-lit emotional beat' },
    ],
  },
  '3d-animation-5': {
    title: 'Kuna Series · Forest Quest',
    subtitle: '9:16 3D Character Micro-Series',
    prompt:
      'Direct a vibrant 9:16 3D animated adventure episode starring Kuna, an energetic young hero with oversized expressive eyes and a billowing woven scarf, leaping playfully across sunlit mossy stepping stones in a lush tropical canyon while a mischievous glowing forest spirit darts ahead.',
    promptExtra:
      'Soft subsurface skin shading, stylized painterly foliage, snappy squash-and-stretch jump arcs, sunny turquoise-and-ochre adventure palette.',
    assistantLead:
      'I will keep Kuna’s character silhouette, scarf physics, and lively facial expressions consistent throughout the canyon chase.',
    actions: [
      { title: 'Lock "Kuna Character & Scarf Rig"', meta: 'Subsurface shading + responsive cloth follow-through' },
      { title: 'Animate "Canyon Stepping-Stone Leap"', meta: 'Dynamic camera follow + playful anticipation arc' },
      { title: 'Light "Sun-Dappled Tropical Valley"', meta: 'Warm rim shafts + floating glowing pollen' },
    ],
  },
  '3d-animation-1': {
    title: 'English Course · 3D Explainer',
    subtitle: '9:16 Playful 3D EdTech Ad',
    prompt:
      'Animate a bright, charming 9:16 3D character spot for a modern English learning app: a friendly stylized student sits at a pastel desk surrounded by floating tactile 3D speech bubbles, mini London phone booths, and animated flashcards that pop smoothly into place as confidence clicks.',
    promptExtra:
      'Clean matte-clay 3D materiality, soft studio bounce lighting, crisp spring-eased prop pops, joyful modern educational palette.',
    assistantLead:
      'I will choreograph crisp 3D prop reveals and friendly character gestures so the learning benefit reads instantly.',
    actions: [
      { title: 'Build "Pastel 3D Study World"', meta: 'Tactile matte clay & glossy accent props' },
      { title: 'Animate "Floating Speech-Bubble Pop"', meta: 'Snappy spring entrances synced to dialogue beats' },
      { title: 'Frame "Confident Student Finale"', meta: 'Clean hero smile + open space for app CTA' },
    ],
  },
  '3d-animation-6': {
    title: 'Strawberry & Pineapple · 3D Splash',
    subtitle: '9:16 Stylized 3D Fruit Commercial',
    prompt:
      'Render a mouthwatering 9:16 stylized 3D food-motion piece where glossy ruby strawberries and golden pineapple chunks collide mid-air in zero gravity, bursting into sparkling translucent juice ribbons, swirling yogurt waves, and crisp chilled droplets against a bright sunlit backdrop.',
    promptExtra:
      'Hyper-tactile translucent fruit subsurface shading, high-speed fluid splash simulation, bright studio rim highlights, joyful summer color punch.',
    assistantLead:
      'I will dial in juicy subsurface scattering and sparkling mid-air splash arcs for instant sensory appeal.',
    actions: [
      { title: 'Shade "Translucent Fruit Macro"', meta: 'Crisp seed detail + sunlit subsurface glow' },
      { title: 'Simulate "Zero-G Juice & Cream Collision"', meta: 'Silky fluid ribbons + micro droplet spray' },
      { title: 'Orbit "Slow-Motion Splash Hero"', meta: 'Clean pastel studio sweep at 120fps' },
    ],
  },
  '3d-animation-7': {
    title: 'UFC Robot · Octagon Clash',
    subtitle: '9:16 3D Mecha Combat Short',
    prompt:
      'Direct an adrenaline-pumping 9:16 3D mecha fight sequence inside a neon-lit futuristic octagon cage: two heavy articulated combat robots trade thunderous hydraulic uppercuts, sending electric sparks, sheared carbon-fiber plates, and mist flying under pulsing arena spotlights.',
    promptExtra:
      'Gritty brushed-steel and glowing hydraulic shaders, handheld ringside camera shake on punches, high-speed spark trails, dramatic arena haze.',
    assistantLead:
      'I will emphasize heavy mechanical weight, hydraulic recoil, and explosive spark physics on every ringside blow.',
    actions: [
      { title: 'Animate "Hydraulic Uppercut Impact"', meta: 'Weighted piston recoil + slow-mo impact frame' },
      { title: 'Simulate "Arena Sparks & Debris"', meta: 'Ricocheting welding sparks across cage mesh' },
      { title: 'Light "Pulsing Octagon Spotlights"', meta: 'Volumetric stadium beams + metallic rim sheen' },
    ],
  },
  '3d-animation-4': {
    title: 'Gigi vs Lidah · 3D Comedy',
    subtitle: '9:16 Anthropomorphic 3D Micro-Story',
    prompt:
      'Create a hilarious 9:16 stylized 3D character comedy starring expressive cartoon Tooth and Tongue characters bickering dramatically inside a colorful glossy studio world whenever a crunchy snack arrives—complete with exaggerated eyebrow raises, playful slapstick bounces, and punchy comedic reaction cuts.',
    promptExtra:
      'Glossy toy-like 3D rendering, expressive Pixar-inspired squash-and-stretch facial animation, crisp studio key lighting, brisk comedic timing.',
    assistantLead:
      'I will push expressive comedic posing and snappy reaction cuts so the playful rivalry lands in the first two seconds.',
    actions: [
      { title: 'Rig "Expressive Tooth & Tongue Duo"', meta: 'Exaggerated brow arcs + glossy ceramic shaders' },
      { title: 'Time "Slapstick Crunch Reaction"', meta: 'Snappy whip-pan cuts between rival expressions' },
      { title: 'Light "Clean Toybox Studio Look"', meta: 'Soft pastel bounce + crisp specular rim' },
    ],
  },
  '3d-animation-2': {
    title: 'Kelapa & Semangka · Tropical 3D',
    subtitle: '9:16 Playful 3D Beverage Spot',
    prompt:
      'Produce a breezy 9:16 3D tropical refreshment spot where a cracked green coconut and crisp red watermelon slice tumble down a sunlit turquoise water slide, splashing into a frosted glass bursting with crushed ice and refreshing mint leaves.',
    promptExtra:
      'Vibrant tropical daylight illumination, crisp water-splash refraction, juicy watermelon seed textures, refreshing summer color grade.',
    assistantLead:
      'I will blend playful fruit choreography with hyper-crisp ice and water simulation for an irresistible summer spot.',
    actions: [
      { title: 'Animate "Tropical Fruit Slide Drop"', meta: 'Playful tumbling physics + sunlit water trails' },
      { title: 'Simulate "Frosted Glass Ice Splash"', meta: 'Sparkling water crown + floating mint leaves' },
      { title: 'Grade "Bright Coastal Refreshment"', meta: 'Turquoise highlights + crisp ruby contrast' },
    ],
  },
  '3d-animation-8': {
    title: 'Anime Series · Rooftop Confrontation',
    subtitle: '16:9 Stylized 2D/3D Anime Drama',
    prompt:
      'Direct a widescreen 16:9 stylized anime drama scene on a wind-swept school rooftop at sunset: two rivals stand beneath glowing crimson clouds as fluttering uniform jackets, dramatic cel-shaded rim highlights, and dynamic sakuga camera arcs heighten the emotional turning point.',
    promptExtra:
      'Crisp cel-shaded anime linework, painted Makoto Shinkai-inspired sunset sky, wind-animated hair and fabric, expressive speed-line camera whip.',
    assistantLead:
      'I will pair painterly sunset skies with crisp cel-shaded character lighting and dynamic anime camera framing.',
    actions: [
      { title: 'Paint "Crimson Sunset Rooftop Sky"', meta: 'Luminous clouds + warm golden rim lighting' },
      { title: 'Animate "Wind-Swept Sakuga Arc"', meta: 'Fluttering jacket physics + dramatic orbit pan' },
      { title: 'Hold "Intense Eye-Line Close-Up"', meta: 'Crisp cel highlights + emotional dialogue beat' },
    ],
  },
  '3d-animation-9': {
    title: 'Minimonz · 3D Gummy World',
    subtitle: '16:9 Playful 3D Toy-World Commercial',
    prompt:
      'Animate a whimsical 16:9 3D miniature creature adventure where bouncy, translucent gummy-bear monsters tumble joyfully across a candy-colored tabletop playground, bouncing off giant fruit jelly trampolines with sparkling sugar particles catching warm studio light.',
    promptExtra:
      'Translucent gummy subsurface scattering, buoyant jelly-jiggle soft-body physics, vibrant playful lighting, wide cinematic toy-scale tracking.',
    assistantLead:
      'I will emphasize translucent gummy materiality and bouncy soft-body movement so every character feels tactile and joyful.',
    actions: [
      { title: 'Shade "Translucent Gummy Monsters"', meta: 'Rich fruity subsurface glow + sugar sparkle' },
      { title: 'Simulate "Soft-Body Jelly Bounce"', meta: 'Playful squash-and-stretch trampoline hops' },
      { title: 'Track "Tabletop Playground Sweep"', meta: 'Wide miniature lens + cheerful color vibrancy' },
    ],
  },

  // =========================================================================
  // MUSIC FILM (Filmmaking — Music Film)
  // =========================================================================
  'music-videos-168': {
    title: 'Tak Pernah Sampai · Ballad Film',
    subtitle: '16:9 Narrative Indie Music Video',
    prompt:
      'Direct a melancholic 16:9 indie-ballad music video titled "Tak Pernah Sampai": intercut a lone singer performing softly under a dim amber tungsten bulb with nostalgic rain-streaked bus window memories, empty twilight train platforms, and slow-motion footsteps fading into blue-hour mist.',
    promptExtra:
      'Anamorphic 2.39:1 widescreen framing, gentle 16mm film grain, bittersweet teal-and-amber twilight grade, lyrical slow-motion pacing synced to ballad tempo.',
    assistantLead:
      'I will weave intimate vocal performance shots with poetic memory vignettes that breathe naturally with the song’s emotional arc.',
    actions: [
      { title: 'Stage "Amber Bulb Vocal Performance"', meta: 'Intimate 85mm close-up, soft shadow falloff' },
      { title: 'Weave "Rain-Window Memory Vignettes"', meta: 'Slow-motion blue-hour commuter reflections' },
      { title: 'Sync "Chorus Emotional Swell Cut"', meta: 'Measured lyric-timed dissolves + 16mm grain' },
    ],
  },
  'music-videos-167': {
    title: 'Midnight Pulse · Performance Cut',
    subtitle: '16:9 Atmospheric Performance Video',
    prompt:
      'Shoot a moody 16:9 electronic-pop performance music film inside a haze-filled concrete warehouse bathed in sweeping cobalt and magenta spotlights. Alternate between hypnotic low-angle orbital tracking shots around the artist and razor-sharp rhythmic strobe cuts timed to the kick drum.',
    promptExtra:
      'Volumetric stage haze, high-contrast concert lighting, dynamic gimbal push-pulls, rich nocturnal neon palette.',
    assistantLead:
      'I will choreograph sweeping stage beams and beat-locked camera pushes so the visual energy builds cleanly into the drop.',
    actions: [
      { title: 'Light "Cobalt & Magenta Stage Haze"', meta: 'Sweeping overhead concert beams + dark silhouettes' },
      { title: 'Orbit "Gimbal Performance Push-Pull"', meta: 'Fluid 28mm wide tracking synced to verse rhythm' },
      { title: 'Drop "Beat-Synced Strobe Montage"', meta: 'Precision percussion cuts across hook peak' },
    ],
  },
  'music-videos-166': {
    title: 'Choreography Studio · Dance Film',
    subtitle: '16:9 Kinetic Dance Music Video',
    prompt:
      'Direct an energetic 16:9 contemporary dance music video inside an industrial loft with towering sunlit windows: a synchronized dance crew executes razor-sharp formation shifts while a reactive gimbal camera darts, dips, and whips in lockstep with every floor hit and spin.',
    promptExtra:
      'Crisp daylight backlight through tall warehouse panes, wide-to-tight kinetic gimbal choreography, clean modern urban street-dance wardrobe.',
    assistantLead:
      'I will match camera dips and whip-pans directly to the dancers’ counts so the choreography feels electric.',
    actions: [
      { title: 'Block "Sunlit Loft Crew Formation"', meta: 'Wide 24mm backlight emphasizing full-body lines' },
      { title: 'Sync "Reactive Gimbal Whip-Moves"', meta: 'Camera drops & snaps locked to choreography hits' },
      { title: 'Finish "Final Pose Freeze Pull-Back"', meta: 'Crisp wide pull-out holding crew silhouette' },
    ],
  },

  // =========================================================================
  // CINEMATIC ADS (Ads Agent & UGC — Cinematic Ads)
  // =========================================================================
  'cinematic-ads-62': {
    title: 'Coca-Cola · Ice-Cold Effervescence',
    subtitle: '16:9 Global Beverage Commercial',
    prompt:
      'Shoot a crisp 16:9 flagship beverage commercial for Coca-Cola: open on an ultra-macro 100mm shot of chilled condensation beads racing down a curved contour glass bottle, cut to a high-speed golden amber pour exploding into sparkling carbonation bubbles over crystal-clear ice cubes, and land on a sunlit summer hero tabletop reveal.',
    promptExtra:
      'High-speed 120fps liquid cinematography, warm ruby-and-amber backlit liquid glow, razor-sharp ice refraction, refreshing fizz audio punctuation.',
    assistantLead:
      'I will prioritize sparkling carbonation clarity, crisp backlit caramel tones, and mouthwatering cold-glass condensation.',
    actions: [
      { title: 'Capture "Macro Bottle Condensation"', meta: '100mm lens, gliding droplets under crisp rim light' },
      { title: 'Shoot "120fps Amber Pour & Fizz"', meta: 'Backlit bubbles erupting over crystal ice cubes' },
      { title: 'Lock "Sunlit Brand Hero Frame"', meta: 'Iconic red-and-glass contrast with clean end space' },
    ],
  },
  'cinematic-ads-59': {
    title: 'Noir Luxury · Silhouette Reveal',
    subtitle: '9:16 High-Contrast Brand Teaser',
    prompt:
      'Direct a moody 9:16 luxury teaser commercial inside an architectural concrete-and-glass gallery: shafts of cool silver daylight carve dramatically across a sleek matte product silhouette as the camera executes a slow, measured orbital reveal highlighting brushed textures and engraved brand craftsmanship.',
    promptExtra:
      'Sculptural chiaroscuro lighting, 50mm anamorphic prime, understated monochrome-and-silver color grade, restrained luxury pacing.',
    assistantLead:
      'I will let clean shadow geometry and slow, confident camera movement convey unmistakable premium craftsmanship.',
    actions: [
      { title: 'Sculpt "Architectural Rim-Light Reveal"', meta: 'Sharp silver daylight beam across dark matte form' },
      { title: 'Glide "Macro Craftsmanship Orbit"', meta: 'Slow 50mm push revealing engraved edge details' },
      { title: 'Hold "Minimal Luxury End-Card"', meta: 'Balanced negative space for brand wordmark' },
    ],
  },
  'cinematic-ads-24': {
    title: 'Rexona · Nonstop Motion Ad',
    subtitle: '9:16 Active Personal Care Spot',
    prompt:
      'Produce an energetic 9:16 commercial for Rexona following an urban sprinter charging effortlessly across sunlit city steps and subway platforms during midday heat. Cut between kinetic low-angle running strides, crisp cool-mist motion trails symbolizing fresh all-day protection, and a confident sweat-free close-up.',
    promptExtra:
      'Dynamic handheld sports tracking, refreshing cool-blue and white visual accents, high-shutter athletic clarity, upbeat percussive rhythm.',
    assistantLead:
      'I will pair fast urban athletic energy with crisp cooling visual cues that reinforce unstoppable freshness.',
    actions: [
      { title: 'Track "Urban Sprinter Stride"', meta: 'Low-angle kinetic follow across sunlit city stairs' },
      { title: 'Overlay "Cool-Mist Protection Cue"', meta: 'Clean airy breeze particles around motion arc' },
      { title: 'Land "Confident Hero Product Lockup"', meta: 'Crisp studio packshot with cooling sheen' },
    ],
  },
  'cinematic-ads-37': {
    title: 'Artisan Fruit Jam · Morning Spread',
    subtitle: '9:16 Culinary Commercial',
    prompt:
      'Film a cozy, mouthwatering 9:16 breakfast commercial for an artisan fruit jam: warm morning sunlight streams onto a rustic linen table as a butter knife lifts glistening ruby berry preserves from a glass jar and spreads a velvety ribbon across crisp toasted sourdough bread in sumptuous slow motion.',
    promptExtra:
      'Warm golden morning backlight, 85mm macro lens capturing glossy fruit chunks, gentle rising toast steam, cozy appetizing palette.',
    assistantLead:
      'I will highlight the glossy texture and real fruit chunks in rich morning sunlight so every frame feels delicious.',
    actions: [
      { title: 'Open "Glass Jar Lid-Pop Macro"', meta: 'Sunlit morning table + glistening berry sheen' },
      { title: 'Shoot "Slow-Motion Sourdough Spread"', meta: '85mm macro ribbon glide across golden crust' },
      { title: 'Stage "Warm Breakfast Hero Table"', meta: 'Soft steam wisps + crisp jar label hero framing' },
    ],
  },
  'cinematic-ads-26': {
    title: 'Luminous Serum · Skincare Campaign',
    subtitle: '9:16 Luxury Skincare Commercial',
    prompt:
      'Direct a luminous 9:16 beauty commercial for a hydrating facial serum: a crystal glass dropper suspends a single radiant serum droplet that falls in slow motion onto rippling translucent water before cutting to a glowing close-up of dewy, naturally sunlit skin.',
    promptExtra:
      'High-key frosted-glass studio aesthetic, soft pearlescent light bounce, 100mm beauty macro lens, clean hydrating water-ripple reflections.',
    assistantLead:
      'I will keep lighting ultra-clean and natural so the serum’s hydration texture and real skin radiance shine without over-retouching.',
    actions: [
      { title: 'Capture "Suspended Dropper Slow-Mo"', meta: '100mm macro glass refraction + golden liquid bead' },
      { title: 'Cut "Dewy Sunlit Skin Close-Up"', meta: 'Soft pearlescent fill highlighting healthy glow' },
      { title: 'Stage "Frosted Plinth Packshot"', meta: 'Water-caustic shadows behind hero bottle' },
    ],
  },
  'cinematic-ads-10': {
    title: 'Nescafé · Awakening Roast',
    subtitle: '9:16 Coffee Commercial',
    prompt:
      'Shoot a bold, aromatic 9:16 morning commercial for Nescafé: dark swirling coffee cascades in slow motion into a clear glass mug, forming rich golden-brown crema spirals as early dawn sunlight breaks through a city apartment window and illuminates rising ribbons of steam.',
    promptExtra:
      'Rich espresso-and-gold color contrast, crisp high-speed liquid swirl, warm sunrise window key light, inviting morning atmosphere.',
    assistantLead:
      'I will craft a tactile sensory progression from swirling liquid crema to a warm, energizing first-sip sunrise moment.',
    actions: [
      { title: 'Film "High-Speed Crema Swirl"', meta: 'Macro backlit amber spirals in clear glass' },
      { title: 'Light "City Dawn Window Steam"', meta: 'Golden morning shafts catching delicate vapor' },
      { title: 'Reveal "Energized Morning Packshot"', meta: 'Bold red-and-espresso contrast hero frame' },
    ],
  },
  'cinematic-ads-50': {
    title: 'Sport Action · Peak Velocity',
    subtitle: '9:16 High-Octane Sportswear Ad',
    prompt:
      'Direct an intense 9:16 athletic commercial tracking a runner exploding off starting blocks inside a misty floodlit stadium tunnel. Intercut explosive slow-motion muscle tension, flying track-rubber grit, and rapid breath clouds in crisp night air before bursting into blinding stadium daylight.',
    promptExtra:
      'Dramatic backlit haze, 240fps impact ramps, gritty athletic film contrast, driving heartbeat percussion build.',
    assistantLead:
      'I will build dramatic tension inside the dim tunnel before unleashing a bright, triumphant sprint burst.',
    actions: [
      { title: 'Build "Tunnel Starting-Block Tension"', meta: 'Tight close-ups on laced spikes & steady breath' },
      { title: 'Explode "240fps Sprint Launch"', meta: 'Flying track grit + sweeping side tracking rig' },
      { title: 'Burst "Stadium Daylight Climax"', meta: 'High-contrast silhouette into bright arena flare' },
    ],
  },
  'cinematic-ads-60': {
    title: 'Editorial Spotlight · Brand Hero',
    subtitle: '9:16 Studio Product Cinema',
    prompt:
      'Create a polished 9:16 studio commercial built around precision motion-control camera arcs: a flagship lifestyle product rests on a sculpted travertine pedestal as rotating warm-and-cool key lights glide smoothly across matte curves, revealing subtle metallic accents and refined design geometry.',
    promptExtra:
      'Minimalist gallery set design, smooth orbital slider motion, crisp 4K surface fidelity, sophisticated neutral palette.',
    assistantLead:
      'I will use restrained light sweeps and stone-plinth composition so the product silhouette reads like an industrial design showcase.',
    actions: [
      { title: 'Stage "Travertine Pedestal Hero"', meta: 'Architectural stone textures + soft rim glow' },
      { title: 'Sweep "Precision Light-Arc Orbit"', meta: 'Moving studio reflections across product contours' },
      { title: 'Settle "Clean Symmetrical End-Frame"', meta: 'Editorial balance ready for campaign tagline' },
    ],
  },
  'cinematic-ads-64': {
    title: 'BYD · Electric Horizon',
    subtitle: '16:9 EV Automotive Commercial',
    prompt:
      'Direct a sleek 16:9 electric-vehicle launch film for BYD: glide smoothly along a winding coastal highway at blue hour as an aerodynamic electric sedan carves silently around wet cliffside curves, its razor-thin LED lightbar reflecting across dark asphalt before arriving at a minimalist glass pavilion overlooking the ocean.',
    promptExtra:
      'Low Russian-arm car-to-car tracking, glossy liquid paint reflections, cool blue-hour sky contrasted with crisp white LED signature lights.',
    assistantLead:
      'I will showcase silent electric power and aerodynamic body reflections using authentic automotive tracking angles.',
    actions: [
      { title: 'Track "Low Coastal Highway Sweep"', meta: 'Russian-arm pursuit highlighting wheel & paint gloss' },
      { title: 'Detail "LED Lightbar & Cabin Tech"', meta: 'Macro sweep across illuminated headlights & dash' },
      { title: 'Park "Ocean Pavilion Hero Silhouette"', meta: 'Wide blue-hour reveal with crisp EV badge lock' },
    ],
  },
  'cinematic-ads-41': {
    title: "O'Connor · Crafted Footwear",
    subtitle: '9:16 Studio Footwear Commercial',
    prompt:
      'Produce a refined 9:16 footwear commercial for O’Connor: open on tight macro glides tracing hand-stitched leather seams and supple suede grain, then cut to confident rhythmic footsteps across travertine marble floors in warm architectural daylight.',
    promptExtra:
      'Rich saddle-leather and warm stone palette, crisp 85mm craftsmanship close-ups, grounded low-angle stride tracking.',
    assistantLead:
      'I will pair tactile leather craftsmanship macros with clean architectural walking shots that signal effortless elegance.',
    actions: [
      { title: 'Trace "Hand-Stitched Leather Macro"', meta: 'Shallow 85mm glide over fine welt & texture' },
      { title: 'Track "Travertine Lobby Footsteps"', meta: 'Low-angle stride framing silhouette & flex' },
      { title: 'Stage "Editorial Pedestal Pair"', meta: 'Warm sunlit architectural shadow composition' },
    ],
  },
  'cinematic-ads-18': {
    title: 'Glam Sale · Beauty Flash Campaign',
    subtitle: '9:16 Vibrant Makeup Commercial',
    prompt:
      'Direct an upbeat 9:16 beauty sale commercial featuring a radiant model in a bright sunlit vanity studio showcasing velvety lip tints, shimmering highlighter palettes, and effortless brush sweeps—punctuated by snappy match-cut shade swaps and glossy product macro spins.',
    promptExtra:
      'Bright editorial beauty ring-and-softbox lighting, true-to-life cosmetic pigment rendering, energetic commercial pacing, rose-gold studio accents.',
    assistantLead:
      'I will keep cosmetic colors accurate and skin luminous while pacing quick shade transitions for strong conversion energy.',
    actions: [
      { title: 'Open "Sunlit Vanity Shade Swap"', meta: 'Snappy match-cut transitions across lip shades' },
      { title: 'Macro "Shimmer Palette Swatch"', meta: 'Crisp pigment texture & silky brush sweep' },
      { title: 'Close "Campaign Offer Hero Lockup"', meta: 'Bright editorial layout leaving clean promo space' },
    ],
  },
  'cinematic-ads-11': {
    title: 'Biore Men · Deep Clean Splash',
    subtitle: '9:16 Men’s Grooming Commercial',
    prompt:
      'Shoot a crisp, invigorating 9:16 grooming spot for Biore Men: after a gritty twilight city workout, a confident protagonist splashes ice-cold water across his face in explosive 120fps slow motion—water arcs glistening under bold steel-blue rim lighting to reveal refreshed, energized matte skin.',
    promptExtra:
      'High-speed splash photography, cool cobalt-and-graphite color palette, crisp specular water beads, sharp masculine commercial energy.',
    assistantLead:
      'I will contrast gritty urban fatigue with an explosive high-speed splash transformation for immediate visual payoff.',
    actions: [
      { title: 'Capture "120fps Cold-Water Splash"', meta: 'Sculptural water arc lit by crisp cobalt rim' },
      { title: 'Reveal "Fresh Energized Close-Up"', meta: 'Clean matte skin detail + confident look to lens' },
      { title: 'Stage "Chilled Packshot Splash"', meta: 'Micro-scrub visual energy around hero tube' },
    ],
  },
  'cinematic-ads-23': {
    title: 'Gatsby · Sharp Street Styling',
    subtitle: '9:16 Men’s Style & Grooming Spot',
    prompt:
      'Direct a sharp 9:16 urban style spot for Gatsby: open in a minimalist barbershop mirror as a guy works matte styling clay effortlessly through textured hair, then whip-pan straight out onto a golden-hour downtown street where every head turns as his hairstyle stays locked cleanly against the city breeze.',
    promptExtra:
      'Snappy mirror-to-street whip transition, crisp modern street-fashion grading, sharp hair-texture clarity, confident rhythmic soundtrack feel.',
    assistantLead:
      'I will bridge the quick styling routine straight into sharp street confidence with a seamless mirror whip-cut.',
    actions: [
      { title: 'Frame "Mirror Styling Quick-Cut"', meta: 'Crisp hand-to-hair texture shaping detail' },
      { title: 'Whip-Pan "Downtown Golden-Hour Walk"', meta: 'Confident street stride with wind-proof hold' },
      { title: 'Lock "Matte Tin Product Hero"', meta: 'Sharp graphite studio backdrop + bold rim light' },
    ],
  },
  'cinematic-ads-58': {
    title: 'Cut-Go · Kinetic Brand Film',
    subtitle: '9:16 Modern Motion-Led Ad',
    prompt:
      'Create a hyper-modern 9:16 lifestyle brand film driven by bold geometric match-cuts: crisp macro product textures snap seamlessly into dynamic urban lifestyle vignettes, sleek typography flashes, and fast whip-zooms that keep visual momentum electric from start to finish.',
    promptExtra:
      'Clean contemporary design aesthetic, velocity-ramped transitions, high-contrast studio-to-street daylight continuity.',
    assistantLead:
      'I will synchronize sharp geometric cuts and rhythmic speed-ramps for a modern direct-to-consumer launch aesthetic.',
    actions: [
      { title: 'Cut "Geometric Match-Cut Intro"', meta: '0–2.5s visual hook with crisp shape alignment' },
      { title: 'Pace "Lifestyle Motion Sequence"', meta: 'Snappy whip-zooms bridging studio & street' },
      { title: 'Land "Clean Brand Identity Frame"', meta: 'Bold minimalist typography hold' },
    ],
  },
  'cinematic-ads-47': {
    title: 'Surreal Pantry Cans · Viral Concept Ad',
    subtitle: '9:16 Playful Indonesian FMCG Concept',
    prompt:
      'Direct a viral 9:16 concept commercial imagining iconic Indonesian kitchen staples—fluffy steamed rice, savory mie goreng seasoning, and umami crystals—repackaged inside sleek frosted aluminum soda cans. Pull a crisp tab-pop macro as surprising savory steam and sizzling toppings burst whimsically from the chilled can.',
    promptExtra:
      'Ultra-crisp beverage-ad studio lighting applied humorously to culinary staples, condensation beads, punchy comedic reveal timing.',
    assistantLead:
      'I will treat the playful pantry-can concept with deadpan luxury commercial polish so the twist lands hilariously.',
    actions: [
      { title: 'Design "Frosted Pantry Can Trio"', meta: 'Crisp metallic label detail + chilled condensation' },
      { title: 'Pop "Tab-Open Savory Twist Macro"', meta: 'High-speed fizz & playful culinary garnish reveal' },
      { title: 'Stage "Lineup Showcase Spin"', meta: 'Glossy dark-tabletop commercial hero sweep' },
    ],
  },
  'cinematic-ads-28': {
    title: 'Fanta Wave · Citrus Surf Spectacle',
    subtitle: '9:16 High-Energy Beverage Fantasy Ad',
    prompt:
      'Create an electrifying 9:16 commercial fantasy for Fanta: fearless surfers carve smoothly across a towering, sunlit translucent wave made entirely of sparkling bright-orange citrus soda, kicking up fizzy neon spray and floating fresh orange slices under a vivid tropical blue sky.',
    promptExtra:
      'Ultra-saturated summer daylight, backlit glowing orange translucent fluid, crisp high-speed fizzy droplets, joyful adrenaline camera tracking.',
    assistantLead:
      'I will make the carbonated citrus wave glow with realistic backlit translucency and explosive summer surf energy.',
    actions: [
      { title: 'Simulate "Sparkling Orange Soda Wave"', meta: 'Backlit translucent citrus barrel + fizzy spray' },
      { title: 'Track "Surfer Tube-Ride Action"', meta: 'Water-housing wide lens inside glowing wave' },
      { title: 'Splash "Chilled Can Summer Lockup"', meta: 'Explosive citrus droplets + vibrant sky backdrop' },
    ],
  },
  'cinematic-ads-51': {
    title: 'Court Ace · Tennis Gear Spot',
    subtitle: '9:16 Court-Side Athletic Commercial',
    prompt:
      'Film a crisp 9:16 athletic commercial on a sun-drenched terracotta clay tennis court: track low across sliding court shoes kicking up clouds of brick-red dust, cut to a 120fps racket sweet-spot strike flattening a neon-yellow tennis ball, and close on a clean editorial hero shot of the footwear.',
    promptExtra:
      'Warm Mediterranean clay tones contrasted with crisp white sportswear, high-shutter dust particles, refined Grand-Slam editorial cinematography.',
    assistantLead:
      'I will contrast rich terracotta clay dust with razor-sharp white footwear details and high-speed athletic power.',
    actions: [
      { title: 'Track "Clay-Court Baseline Slide"', meta: 'Low-angle 120fps shoe grip & red dust plume' },
      { title: 'Capture "Racket Sweet-Spot Impact"', meta: 'Macro ball compression + crisp string vibration' },
      { title: 'Frame "Court-Line Product Hero"', meta: 'Hard midday sun shadows across white court chalk' },
    ],
  },
  'cinematic-ads-31': {
    title: 'O.TWO.O · Velvet Beauty Campaign',
    subtitle: '9:16 Editorial Cosmetics Ad',
    prompt:
      'Direct a chic 9:16 beauty campaign for O.TWO.O cosmetics: pair sculptural floating matte lipstick tubes and silky rose-petal ribbons in a warm champagne studio with close-up beauty shots showcasing featherlight velvet lip texture and luminous editorial confidence.',
    promptExtra:
      'Champagne-and-rose luxury beauty lighting, silky fabric slow-motion, flawless micro-skin texture fidelity, sleek modern cosmetic pacing.',
    assistantLead:
      'I will balance tactile velvet cosmetic swatches with poised editorial beauty portraits for a high-fashion finish.',
    actions: [
      { title: 'Stage "Floating Velvet Lipstick Macro"', meta: 'Champagne studio reflections + silk petal swirl' },
      { title: 'Capture "Luminous Lip Texture Portrait"', meta: '85mm beauty key light highlighting matte finish' },
      { title: 'Compose "Campaign Collection Hero"', meta: 'Balanced rose-gold lineup with clean end frame' },
    ],
  },
  'cinematic-ads-43': {
    title: "O'Connor · Urban Stride Film",
    subtitle: '9:16 Heritage Lifestyle Footwear Ad',
    prompt:
      'Shoot a sophisticated 9:16 lifestyle footwear film following a well-tailored commuter stepping briskly across rain-kissed cobblestone alleys and warm wooden espresso bars at golden hour, keeping focus anchored on the timeless silhouette and supple sheen of O’Connor leather shoes.',
    promptExtra:
      'Warm European autumn color palette, smooth low-gimbal foot-level tracking, shallow cinema bokeh, understated tailored elegance.',
    assistantLead:
      'I will keep camera movement fluid and foot-level so the shoe silhouette leads the entire urban lifestyle narrative.',
    actions: [
      { title: 'Follow "Cobblestone Golden-Hour Stride"', meta: 'Low gimbal track highlighting heel-to-toe roll' },
      { title: 'Cut "Espresso Bar Detail Beat"', meta: 'Warm wood reflections beside polished leather toe' },
      { title: 'Close "Timeless Silhouette Hold"', meta: 'Clean editorial framing with soft depth falloff' },
    ],
  },
  'cinematic-ads-52': {
    title: 'Volume Lash · Mascara Macro Ad',
    subtitle: '9:16 Precision Beauty Commercial',
    prompt:
      'Film a sleek 9:16 mascara commercial opening on an ultra-macro wand pull coated in glossy obsidian formula, transitioning into a crystal-clear close-up of a woman sweeping upward through naturally lifted, dramatic fanned lashes under crisp studio catchlights.',
    promptExtra:
      '100mm beauty macro precision, sparkling circular eye catchlights, clean ivory-and-black luxury cosmetics palette, silky slow-motion wand sweep.',
    assistantLead:
      'I will capture ultra-sharp lash separation and natural eye catchlights so the volumizing lift reads immediately.',
    actions: [
      { title: 'Macro "Obsidian Mascara Wand Pull"', meta: 'Glossy bristle texture on clean ivory ground' },
      { title: 'Capture "Upward Lash-Lift Close-Up"', meta: '100mm crisp eye catchlight + smooth brush sweep' },
      { title: 'Reveal "Before-to-Bold Glamour Blink"', meta: 'Confident slow-motion blink + sleek tube lockup' },
    ],
  },
  'cinematic-ads-36': {
    title: 'Abaya · Desert Silk Editorial',
    subtitle: '9:16 Modest Luxury Fashion Film',
    prompt:
      'Direct a graceful 9:16 modest-fashion campaign film: a poised model in a flowing obsidian-and-champagne embroidered abaya walks calmly across sculpted wind-rippled sand dunes at golden hour as sheer silk chiffon billows dramatically behind her against a warm pastel horizon.',
    promptExtra:
      'Slow-motion 60fps silk drape physics, glowing golden-hour rim light, delicate beadwork macro cutaways, serene luxury fashion pacing.',
    assistantLead:
      'I will celebrate fluid garment movement and intricate embroidery details against sweeping golden desert light.',
    actions: [
      { title: 'Capture "Billowing Chiffon Dune Walk"', meta: '60fps slow-motion fabric flow + warm backlight' },
      { title: 'Detail "Embroidery & Cuff Macro"', meta: 'Shallow 85mm focus tracing delicate gold thread' },
      { title: 'Frame "Horizon Silhouette Finale"', meta: 'Regal wide desert composition at dusk' },
    ],
  },
  'cinematic-ads-20': {
    title: 'Kinetic Studio · Product Motion',
    subtitle: '9:16 Design-Forward Brand Film',
    prompt:
      'Direct a minimalist 9:16 product-design reveal inside a sunlit Scandinavian studio: crisp architectural shadows shift smoothly across a sculpted everyday object as clean geometric light bars reveal subtle anodized aluminum edges and tactile matte finishes.',
    promptExtra:
      'Architectural sunlight beams, precision slider choreography, calm Scandinavian neutral palette, tactile material realism.',
    assistantLead:
      'I will let shifting daylight geometry and ultra-clean material detail carry the entire visual story.',
    actions: [
      { title: 'Move "Architectural Window Shadows"', meta: 'Warm daylight sliding across minimalist plinth' },
      { title: 'Glide "Anodized Edge Macro Pass"', meta: 'Crisp focus pull along chamfered metal seams' },
      { title: 'Settle "Balanced Studio Hero"', meta: 'Calm architectural negative space for branding' },
    ],
  },
  'cinematic-ads-45': {
    title: 'Satin Rouge · Lipstick Commercial',
    subtitle: '9:16 High-Glamour Beauty Spot',
    prompt:
      'Shoot a sultry, high-fashion 9:16 lipstick commercial inside a warm mirrored dressing room: open with the metallic click of a sculptural gold-and-black bullet twisting upward, cut to a graceful mirror-angle application of satin crimson lip color, and end on a confident cinematic glance to lens.',
    promptExtra:
      'Warm Hollywood vanity bulb bokeh, crisp mirror depth, rich true-crimson satin texture, smooth 85mm glamour cinematography.',
    assistantLead:
      'I will pair crisp luxury packaging reflections with an effortless, glamorous mirror application moment.',
    actions: [
      { title: 'Twist "Sculptural Lipstick Bullet Macro"', meta: 'Metallic gold glint + rich satin wax texture' },
      { title: 'Frame "Vanity Mirror Application"', meta: 'Intimate over-the-shoulder reflection composition' },
      { title: 'Hold "Confident Glamour Turn"', meta: 'Warm bokeh flare + crisp crimson hero finish' },
    ],
  },
  'cinematic-ads-63': {
    title: 'Pasar Motor · Showroom Cinema',
    subtitle: '16:9 Motorcycle Marketplace Commercial',
    prompt:
      'Direct a dynamic 16:9 automotive commercial for Pasar Motor: sweep across a gleaming showroom of sport bikes and modern urban scooters illuminated by crisp overhead light strips, cutting to an exhilarating golden-hour avenue cruise with low exhaust-level tracking and sharp speedometer close-ups.',
    promptExtra:
      'Glossy fairing reflections, low-angle road-tracking speed sensation, warm sunset city skyline, punchy automotive commercial edit.',
    assistantLead:
      'I will combine sleek showroom polish with real-world riding thrill so the marketplace feels energetic and trustworthy.',
    actions: [
      { title: 'Sweep "Showroom Lineup Glide"', meta: 'Crisp overhead reflections across chrome & fairings' },
      { title: 'Track "Golden-Hour Avenue Ride"', meta: 'Low asphalt pursuit capturing smooth cornering' },
      { title: 'Lock "Rider Confidence & Brand Frame"', meta: 'Clean widescreen hero pause at dusk' },
    ],
  },
  'cinematic-ads-19': {
    title: 'Erha Skincare · Clinical Radiance',
    subtitle: '9:16 Dermatological Beauty Ad',
    prompt:
      'Produce a clean, science-backed 9:16 skincare commercial for Erha: blend serene clinical minimalism—pristine laboratory glass vessels, suspended translucent micro-droplets, and crisp white daylight—with an authentic morning vanity routine showing visibly calm, balanced, radiant skin.',
    promptExtra:
      'Pure architectural white and cool glass tones, micro-emulsion visual textures, crisp daylight skin accuracy, trustworthy modern aesthetic.',
    assistantLead:
      'I will marry clinical credibility with soft, approachable daylight beauty photography.',
    actions: [
      { title: 'Render "Pure Micro-Droplet Science"', meta: 'Crystal glass vessels + clean macro refraction' },
      { title: 'Film "Morning Vanity Application"', meta: 'Natural daylight glow + gentle serum press' },
      { title: 'Stage "Clinical Lineup Packshot"', meta: 'Crisp white architectural shelf composition' },
    ],
  },
  'cinematic-ads-40': {
    title: 'Kahf · Calm Nature Grooming',
    subtitle: '9:16 Botanical Men’s Grooming Film',
    prompt:
      'Direct a grounded, tranquil 9:16 grooming campaign for Kahf: open on misty emerald pine mountains at sunrise with dewdrops sliding off botanical leaves, transition seamlessly into a warm stone bathroom where a calm, confident man washes up with refreshing herbal foam before stepping into crisp morning light.',
    promptExtra:
      'Earthy sage-green, charcoal, and warm stone palette, natural dawn mist, crisp water-droplet macros, peaceful purposeful pacing.',
    assistantLead:
      'I will weave serene botanical nature cues seamlessly into a refined modern men’s morning ritual.',
    actions: [
      { title: 'Open "Misty Pine & Dewdrop Macro"', meta: 'Cool dawn fog + glistening botanical leaf droplets' },
      { title: 'Cut "Stone-Basin Morning Ritual"', meta: 'Clean herbal foam cleanse + calm natural light' },
      { title: 'Land "Sage-Green Product Hero"', meta: 'Wet slate stone plinth with subtle morning mist' },
    ],
  },
  'cinematic-ads-14': {
    title: 'Studio Acoustics · Wireless Headset',
    subtitle: '9:16 Tech Gadget Commercial',
    prompt:
      'Produce a sleek 9:16 tech commercial for flagship over-ear wireless headphones: start inside a noisy bustling subway station that instantaneously dissolves into silent floating zero-gravity tranquility the moment the matte-black earcups seal comfortably over the listener’s ears.',
    promptExtra:
      'Dramatic noise-to-silence visual transition, macro brushed-aluminum hinge details, cool graphite studio rim light, immersive spatial-audio feel.',
    assistantLead:
      'I will visualize active noise cancellation through a striking shift from crowded city motion into weightless acoustic calm.',
    actions: [
      { title: 'Contrast "Subway Bustle to Instant Calm"', meta: 'Visual fade into serene spotlight isolation' },
      { title: 'Macro "Ear-Cup & Aluminum Hinge"', meta: 'Crisp leather cushion detail + dark rim sweep' },
      { title: 'Float "Zero-G Headset Hero Spin"', meta: 'Subtle acoustic wave rings on obsidian backdrop' },
    ],
  },
  'cinematic-ads-61': {
    title: 'Studio Yoga · Mindful Sanctuary',
    subtitle: '16:9 Wellness Studio Brand Film',
    prompt:
      'Film a serene 16:9 brand film for a contemporary yoga sanctuary: warm morning sunbeams slant across pale oak floors and linen curtains as a small class flows in quiet synchronization through sun salutations, accompanied by gentle floating dust motes and calm architectural breathing room.',
    promptExtra:
      'Soft warm natural window light, slow gliding 35mm gimbal movement, organic oak-and-ivory palette, unhurried meditative rhythm.',
    assistantLead:
      'I will let unhurried camera glides and warm morning light convey the calm, restorative atmosphere of the studio.',
    actions: [
      { title: 'Glide "Sunlit Oak Sanctuary Reveal"', meta: 'Soft window shafts across pale wood & plants' },
      { title: 'Follow "Synchronized Breath & Flow"', meta: 'Graceful slow lateral dolly along yoga mats' },
      { title: 'Hold "Peaceful Savasana Close"', meta: 'Warm sunlit stillness with breathing room for logo' },
    ],
  },
  'cinematic-ads-27': {
    title: '212 Men · Midnight Fragrance',
    subtitle: '9:16 Luxury Perfume Commercial',
    prompt:
      'Direct a magnetic 9:16 luxury fragrance commercial for 212: open on a midnight rooftop overlooking glowing Manhattan-style skyscraper lights as a tailored protagonist steps through crisp evening mist, intercut with an ultra-sleek silver-and-obsidian fragrance bottle erupting in a backlit cloud of golden micro-mist.',
    promptExtra:
      'High-contrast nocturnal city bokeh, crisp metallic bottle reflections, slow-motion atomizer spray backlit in gold, suave cinema grade.',
    assistantLead:
      'I will pair magnetic midnight-city charisma with dramatic backlit atomizer photography.',
    actions: [
      { title: 'Stage "Midnight Rooftop Arrival"', meta: 'Glowing skyline bokeh + sharp tuxedo silhouette' },
      { title: 'Capture "Backlit Atomizer Mist Cloud"', meta: '120fps shimmering fragrance spray in dark void' },
      { title: 'Lock "Metallic Bottle Hero Reveal"', meta: 'Crisp silver reflection sweep on obsidian glass' },
    ],
  },
  'cinematic-ads-30': {
    title: 'Nike · Asphalt Ignition',
    subtitle: '9:16 Performance Sneaker Ad',
    prompt:
      'Shoot a punchy 9:16 sneaker commercial for Nike: drop down to wet pre-dawn city asphalt as glowing neon reflections shimmer across sculpted midsoles, cutting sharply from explosive heel-strike compression in slow motion to a relentless uphill sprint through rising urban steam vents.',
    promptExtra:
      'Low-angle kinetic ground tracking, bold moody dawn lighting, crisp knit-mesh texture close-ups, unapologetic athletic drive.',
    assistantLead:
      'I will spotlight outsole traction and midsole bounce right at street level before building into an explosive dawn sprint.',
    actions: [
      { title: 'Macro "Midsole Compression Strike"', meta: '240fps wet-asphalt splash + sole flex detail' },
      { title: 'Chase "Pre-Dawn Steam-Vent Sprint"', meta: 'Low tracking rig charging through city mist' },
      { title: 'Freeze "Suspended Sneaker Hero"', meta: 'Dynamic floating angle on dark concrete backdrop' },
    ],
  },
  'cinematic-ads-35': {
    title: 'Pure Glow · Skincare Editorial',
    subtitle: '9:16 Minimalist Beauty Spot',
    prompt:
      'Create a sunlit 9:16 editorial beauty commercial centered on effortless everyday radiance: soft dappled leaf shadows dance across a sunlit stone backdrop as a smiling model dabs sheer hydrating cream onto cheekbones, paired with clean floating botanical dew drops and silk-smooth texture smears.',
    promptExtra:
      'Organic sunlit shadow play, true natural skin tone fidelity, soft pastel ivory backdrop, serene contemporary beauty rhythm.',
    assistantLead:
      'I will emphasize fresh dappled sunlight and genuine texture swatches for an elevated clean-beauty aesthetic.',
    actions: [
      { title: 'Shoot "Botanical Shadow Texture Swatch"', meta: 'Silky cream smear on warm stone surface' },
      { title: 'Frame "Effortless Sunlit Glow Portrait"', meta: 'Natural dappled light across healthy dewy skin' },
      { title: 'Stage "Clean Beauty Bottle Trio"', meta: 'Minimal sunlit plinth with gentle leaf shadows' },
    ],
  },
  'cinematic-ads-49': {
    title: 'Monolith · Industrial Design Ad',
    subtitle: '9:16 Precision Product Commercial',
    prompt:
      'Direct a razor-sharp 9:16 commercial celebrating precision industrial design: dark geometric light blades sweep systematically across an architectural product centerpiece, revealing micro-milled knurling, glowing subtle status LEDs, and seamless matte contours in crisp slow-motion symmetry.',
    promptExtra:
      'Precision motion-control dolly moves, dark gallery chiaroscuro, cool graphite and subtle cobalt accent highlights.',
    assistantLead:
      'I will rely on exact symmetrical framing and dramatic light-blade reveals to showcase engineering precision.',
    actions: [
      { title: 'Reveal "Light-Blade Contour Sweep"', meta: 'Narrow studio beam tracing matte curves' },
      { title: 'Macro "Micro-Milled Detail Glide"', meta: 'Sharp focus pull across precision hardware edges' },
      { title: 'Lock "Architectural Center Symmetry"', meta: 'Clean dark-surface hero frame' },
    ],
  },
  'cinematic-ads-57': {
    title: 'Namira Coffee · Artisan Brew',
    subtitle: '16:9 Specialty Café Brand Film',
    prompt:
      'Film a warm, inviting 16:9 brand film for Namira Coffee: follow a skilled barista pouring a silky spiral of hot water over freshly ground specialty beans in a glass pour-over dripper, intercut with golden-hour café windows, clinking ceramic cups, and unhurried conversation over warm wooden tables.',
    promptExtra:
      'Rich roasted-chestnut and honey-gold palette, 50mm shallow depth of field, gentle steam plumes backlit by café windows, comforting acoustic feel.',
    assistantLead:
      'I will weave artisanal pour-over craft together with warm neighborhood café hospitality.',
    actions: [
      { title: 'Capture "Bloom & Pour-Over Spiral"', meta: 'Macro amber extraction dripping into glass carafe' },
      { title: 'Frame "Golden-Hour Café Warmth"', meta: 'Soft window bokeh + ceramic latte art pour' },
      { title: 'Finish "Namira Cup Hero Table"', meta: 'Warm wood grain + gentle rising steam' },
    ],
  },
  'cinematic-ads-29': {
    title: 'Velvet Matte · Lip Studio Ad',
    subtitle: '9:16 Modern Lipstick Campaign',
    prompt:
      'Direct a clean, modern 9:16 lipstick ad inside a bright architectural blush-toned set: capture a smooth macro glide of a beveled matte bullet unveiling rich terracotta-rose pigment, followed by an effortlessly chic close-up application and a crisp smile under soft diffused studio daylight.',
    promptExtra:
      'Soft diffused editorial beauty lighting, crisp true-pigment terracotta tones, smooth 85mm close-up clarity, chic minimalist staging.',
    assistantLead:
      'I will highlight smooth one-swipe pigment payoff and effortless modern glamour without visual clutter.',
    actions: [
      { title: 'Macro "One-Swipe Pigment Glide"', meta: 'Velvety terracotta-rose texture reveal' },
      { title: 'Portrait "Soft Daylight Application"', meta: 'Natural luminous skin + crisp lip definition' },
      { title: 'Stage "Architectural Blush Packshot"', meta: 'Minimal geometric blocks + sleek bullet hero' },
    ],
  },
  'cinematic-ads-53': {
    title: 'Adidas · Three-Stripe Momentum',
    subtitle: '9:16 Street-Sport Footwear Ad',
    prompt:
      'Produce an iconic 9:16 street-sport commercial for Adidas: follow a crew of city runners and skaters carving through brutalist concrete underpasses at golden hour, punctuating rapid footwork cuts with crisp macro flashes of the signature three stripes and responsive foam cushioning.',
    promptExtra:
      'Raw brutalist architectural geometry, punchy sunlit contrast, snappy rhythmic skate-and-sprint edits, crisp urban authenticity.',
    assistantLead:
      'I will blend raw concrete street-culture energy with crisp close-up product spotlights on the footwear.',
    actions: [
      { title: 'Track "Brutalist Underpass Stride"', meta: 'Wide kinetic follow along sunlit concrete lines' },
      { title: 'Flash "Three-Stripe Texture Cuts"', meta: 'Rapid macro pops on suede, mesh & sole grip' },
      { title: 'Land "Crew Silhouette Hero Freeze"', meta: 'Crisp urban skyline backdrop + clean logo lock' },
    ],
  },

  // =========================================================================
  // UGC COMMERCIAL (Ads Agent & UGC — UGC)
  // =========================================================================
  'ugc-commercial-162': {
    title: 'Morning Coffee · Creator Routine',
    subtitle: '9:16 Authentic Coffee UGC Ad',
    prompt:
      'Film a cozy, relatable 9:16 morning creator UGC reel in a sunlit apartment kitchen: a friendly creator holds a chilled glass of layered iced coffee directly toward the camera for an instant 2-second hook, clinks ice cubes with a glass straw, takes a genuinely delighted first sip, and shares why it replaced their daily café run.',
    promptExtra:
      'Natural window daylight, authentic handheld smartphone framing, crisp ASMR ice-clink moments, warm approachable creator energy.',
    assistantLead:
      'I will pace this like a top-performing organic TikTok routine with tactile ice-pour ASMR and natural eye-contact.',
    actions: [
      { title: 'Hook "0–2s Iced Coffee Swirl"', meta: 'Sunny countertop pour + crisp ice-clink beat' },
      { title: 'Demo "First-Sip Creator Reaction"', meta: 'Natural handheld framing in soft window light' },
      { title: 'Close "Daily Swap Callout"', meta: 'Warm smile holding hero pack toward lens' },
    ],
  },
  'ugc-commercial-161': {
    title: 'Pizza Hut · Cheese-Pull UGC',
    subtitle: '9:16 Craveable Food Creator Ad',
    prompt:
      'Shoot an irresistibly fun 9:16 foodie UGC clip featuring a steaming hot Pizza Hut box opening right on a cozy living-room table: open with a dramatic close-up molten cheese pull stretching sky-high off a golden stuffed-crust slice, cutting straight to friends reacting wide-eyed on first bite.',
    promptExtra:
      'Warm casual home-table lighting, close-up smartphone foodie perspective, crisp golden crust texture, infectious social dining energy.',
    assistantLead:
      'I will lead with the money-shot cheese pull in the first second so viewers stop scrolling immediately.',
    actions: [
      { title: 'Lead "Instant Box-Open Cheese Pull"', meta: 'Close-up molten stretch + rising hot steam' },
      { title: 'Capture "Friends First-Bite Reaction"', meta: 'Handheld casual table energy + genuine smiles' },
      { title: 'Show "Tabletop Feast Spread"', meta: 'Overhead pan across sides, dips & hero slices' },
    ],
  },
  'ugc-commercial-151': {
    title: 'OOTD · Mirror Fit-Check Reel',
    subtitle: '9:16 Fashion Creator UGC',
    prompt:
      'Create a snappy 9:16 Outfit-of-the-Day creator video filmed in front of a bright bedroom full-length mirror: the creator steps in wearing casual basics, snaps their fingers for three seamless outfit-change transitions—clean office chic, relaxed café denim, and evening minimal—showing fabric drape and pocket details up close.',
    promptExtra:
      'Bright natural bedroom daylight, clean tripod mirror framing, crisp snap-transition cuts, realistic garment texture movement.',
    assistantLead:
      'I will align every snap-transition frame cleanly so the three outfit looks flow like a viral fashion GRWM reel.',
    actions: [
      { title: 'Hook "Full-Length Mirror Fit Check"', meta: 'Clean sunlit room framing + upbeat entry step' },
      { title: 'Snap "Three-Look Wardrobe Swap"', meta: 'Matched hand-snap cuts showing versatile styling' },
      { title: 'Detail "Fabric Drape Close-Up"', meta: 'Quick step toward lens highlighting cut & stitching' },
    ],
  },
  'ugc-commercial-156': {
    title: 'Problem-to-Glow · Creator Hook Ad',
    subtitle: '9:16 Direct-Response UGC Ad',
    prompt:
      'Direct a high-converting 9:16 direct-response UGC ad following a classic hook-demo-proof structure: open on a relatable creator pointing out an everyday frustration in bright natural indoor light, immediately demonstrate the sleek product solving it effortlessly in real time, and wrap with a genuine before-and-after reveal.',
    promptExtra:
      'Authentic phone-camera intimacy, natural conversational pacing, clear hands-on product visibility, uncluttered warm living-space background.',
    assistantLead:
      'I will structure tight 2-second visual pattern interrupts so retention stays high through the final proof shot.',
    actions: [
      { title: 'Open "0–3s Relatable Hook"', meta: 'Direct-to-camera conversational energy in daylight' },
      { title: 'Show "Hands-On Live Product Demo"', meta: 'Clear close-up solving the problem on screen' },
      { title: 'Prove "Satisfied Result & CTA"', meta: 'Natural smile with hero product held cleanly' },
    ],
  },
  'ugc-commercial-150': {
    title: 'Creator Persona · Studio Intro',
    subtitle: '9:16 Talking-Head Brand UGC',
    prompt:
      'Film a warm, trustworthy 9:16 talking-head creator spotlight inside a softly lit minimalist home studio with indoor plants and warm accent lamps: the creator speaks naturally to camera with expressive hand gestures, sharing an honest 15-second product story backed by quick B-roll texture cutaways.',
    promptExtra:
      'Crisp soft-window key light, shallow portrait depth, authentic conversational posture, clean modern creator studio styling.',
    assistantLead:
      'I will blend natural talking-head authenticity with well-timed product B-roll cutaways to keep viewers engaged.',
    actions: [
      { title: 'Frame "Warm Home-Studio Talking Head"', meta: 'Natural eye-line + soft indoor plant bokeh' },
      { title: 'Insert "Tactile Product B-Roll Beats"', meta: 'Quick hands-on close-ups matching key benefits' },
      { title: 'Close "Trustworthy Sign-Off"', meta: 'Warm conversational wrap-up holding product' },
    ],
  },
  'ugc-commercial-164': {
    title: 'RFE · Everyday Essential Review',
    subtitle: '9:16 Creator Unboxing & Review',
    prompt:
      'Produce an authentic 9:16 unboxing-and-first-impressions UGC reel for RFE: start with crisp overhead hands slicing open minimalist packaging on a bright desk, lift out the sleek hero item to inspect build quality up close, and cut to the creator testing it enthusiastically in everyday life.',
    promptExtra:
      'Crisp overhead unboxing daylight, tactile packaging rustle cues, smooth jump-cuts into real-world usage shots.',
    assistantLead:
      'I will pair crisp tactile unboxing shots with genuine real-world testing so the product value feels undeniable.',
    actions: [
      { title: 'Unbox "Crisp Overhead Desk Reveal"', meta: 'Clean packaging lift + tactile finish inspection' },
      { title: 'Test "Real-World Everyday Demo"', meta: 'Handheld creator usage showing practical payoff' },
      { title: 'Rate "Honest Creator Verdict"', meta: 'Direct-to-lens recommendation with clear pack view' },
    ],
  },
  'ugc-commercial-165': {
    title: 'Madu Malaysia · Golden Spoon Ritual',
    subtitle: '9:16 Natural Wellness UGC Ad',
    prompt:
      'Film a warm, appetizing 9:16 wellness UGC video for pure Malaysian honey: sunlight catches a wooden honey dipper lifting a thick, luminous golden-amber ribbon straight into warm lemon water, followed by a creator enjoying the soothing morning tonic in a serene sunlit kitchen.',
    promptExtra:
      'Backlit golden honey translucency, crisp slow-motion viscous drizzle, natural home-kitchen warmth, authentic family wellness tone.',
    assistantLead:
      'I will make the backlit golden honey drizzle the unmistakable visual hero right at the start of the routine.',
    actions: [
      { title: 'Drizzle "Backlit Golden Honey Ribbon"', meta: 'Slow-motion dipper swirl in warm morning light' },
      { title: 'Stir "Soothing Lemon Tonic Mix"', meta: 'Clear glass swirl with rising gentle steam' },
      { title: 'Sip "Refreshed Morning Creator Beat"', meta: 'Genuine smile holding honey jar clearly' },
    ],
  },
  'ugc-commercial-155': {
    title: 'Lifestyle Host · Product Story',
    subtitle: '9:16 Conversational Creator Spot',
    prompt:
      'Direct a breezy 9:16 walk-and-talk creator story shot along a sunlit café patio: a charismatic host introduces their go-to daily favorite while strolling naturally with iced tea in hand, pausing at a marble café table to show off the compact design and effortless usability.',
    promptExtra:
      'Handheld sunlit patio gimbal walk, natural outdoor daylight skin tones, crisp tabletop detail cutaways, friendly social cadence.',
    assistantLead:
      'I will keep the walk-and-talk pacing airy and natural so it feels like a genuine recommendation from a friend.',
    actions: [
      { title: 'Walk "Sunlit Café Patio Hook"', meta: 'Relaxed handheld intro with natural street depth' },
      { title: 'Show "Marble Table Feature Demo"', meta: 'Crisp close-up highlighting compact ergonomics' },
      { title: 'Wrap "Effortless Daily Carry Close"', meta: 'Tucking product neatly into tote bag' },
    ],
  },
  'ugc-commercial-157': {
    title: 'Insulated Tumbler · Ice-Retention Test',
    subtitle: '9:16 Viral Tumbler UGC Demo',
    prompt:
      'Shoot a satisfying 9:16 product-proof UGC reel for an insulated stainless-steel tumbler: open with a crisp scoop of ice clattering into the matte pastel vessel, pour sparkling iced matcha to the brim, twist the leak-proof lid shut, and shake it upside-down over a laptop desk with zero drips.',
    promptExtra:
      'High-clarity desk daylight, crisp ASMR ice-and-lid clicks, bold leak-proof proof stunt, clean modern aesthetic.',
    assistantLead:
      'I will anchor the video around the dramatic upside-down leak-proof test so viewers immediately trust the build quality.',
    actions: [
      { title: 'Load "Crisp Ice & Iced Matcha Pour"', meta: 'Tactile ASMR pour into matte pastel tumbler' },
      { title: 'Prove "Upside-Down Zero-Leak Shake"', meta: 'Bold over-the-desk proof shot in sharp focus' },
      { title: 'Carry "Commute-Ready Sip Finale"', meta: 'Slips cleanly into car cupholder & tote' },
    ],
  },
  'ugc-commercial-159': {
    title: 'Honda · Everyday Drive Story',
    subtitle: '16:9 Relatable Automotive UGC',
    prompt:
      'Film a bright, relatable 16:9 owner-POV lifestyle reel featuring a modern Honda hatchback on a weekend city-to-hills getaway: capture effortless keyless entry, intuitive dashboard navigation, spacious trunk loading for coffee gear, and smooth panoramic driving shots through tree-lined roads.',
    promptExtra:
      'Warm weekend sunlight, authentic driver-and-passenger POV angles, crisp cabin interior clarity, upbeat road-trip atmosphere.',
    assistantLead:
      'I will balance real owner practicality—cabin space and smooth handling—with breezy weekend road-trip charm.',
    actions: [
      { title: 'Open "Keyless Entry & Cabin Start"', meta: 'Clean owner POV entering sunlit interior' },
      { title: 'Pack "Weekend Trunk & Feature Check"', meta: 'Effortless loading + crisp touchscreen glance' },
      { title: 'Cruise "Tree-Lined Scenic Drive"', meta: 'Smooth exterior tracking through dappled sunlight' },
    ],
  },
  'ugc-commercial-154': {
    title: 'Energen · 60-Second Breakfast Hack',
    subtitle: '9:16 Quick Morning Drink UGC',
    prompt:
      'Create a lively 9:16 busy-morning creator reel for Energen cereal drink: open on a rushed student glancing at a 7:15 AM clock, tear open a sachet in a crisp close-up, pour hot water over floating oats and creamy vanilla swirls, and take a satisfied warm sip before heading out the door energized.',
    promptExtra:
      'Bright crisp morning kitchen lighting, satisfying creamy oat-swirl close-up, relatable commuter pacing, warm comforting mood.',
    assistantLead:
      'I will turn the quick sachet-to-mug routine into a cozy, appetizing 10-second breakfast solution.',
    actions: [
      { title: 'Hook "Busy 7:15 AM Morning Rush"', meta: 'Relatable kitchen glance + quick sachet tear' },
      { title: 'Swirl "Creamy Oat & Milk Pour"', meta: 'Macro glass mug showing rich cereal texture' },
      { title: 'Energize "Warm First-Sip Smile"', meta: 'Grab-and-go confidence holding hero mug' },
    ],
  },
  'ugc-commercial-160': {
    title: 'Desk Tumbler · Aesthetic Hydration',
    subtitle: '9:16 Minimalist Desk-Setup UGC',
    prompt:
      'Produce an aesthetic 9:16 desk-setup hydration reel starring a sleek brushed-matte tumbler beside a minimalist laptop workspace: capture soft morning light skimming across the ergonomic handle, crisp flip-straw sips between creative sprints, and an overhead flat-lay matching neutral desk accessories.',
    promptExtra:
      'Calm Scandinavian desk palette, soft diffused morning window light, crisp close-up ergonomic details, soothing productivity vibe.',
    assistantLead:
      'I will frame the tumbler as an elevated everyday desk essential that fits seamlessly into a modern creative workflow.',
    actions: [
      { title: 'Stage "Minimalist Morning Desk Setup"', meta: 'Soft daylight across notebook, laptop & tumbler' },
      { title: 'Detail "Flip-Straw & Matte Grip"', meta: 'Close-up tactile handle lift + condensation-free body' },
      { title: 'Frame "Color-Matched Flat-Lay Close"', meta: 'Clean overhead workspace symmetry' },
    ],
  },
  'ugc-commercial-158': {
    title: 'Atlas Coffee · World Roast Unboxing',
    subtitle: '9:16 Specialty Coffee Subscription UGC',
    prompt:
      'Direct a vibrant 9:16 coffee-lover unboxing reel for Atlas Coffee: peel open a colorful patterned origin bag on a warm walnut counter, inhale the fresh single-origin aroma, scoop glossy whole beans into a hand grinder, and pour a velvety latte topped with crisp micro-foam art.',
    promptExtra:
      'Warm artisan kitchen daylight, rich tactile bean-and-bag textures, smooth overhead-to-eye-level jump cuts, genuine coffee-enthusiast joy.',
    assistantLead:
      'I will highlight the tactile joy of discovering colorful single-origin roasts right from home.',
    actions: [
      { title: 'Unbox "Colorful Single-Origin Bag"', meta: 'Crisp bag reveal + glossy whole-bean scoop' },
      { title: 'Brew "Fresh Grind & Espresso Pull"', meta: 'Rich tiger-stripe extraction in clear glass' },
      { title: 'Taste "Home-Barista First Sip"', meta: 'Warm morning smile holding vibrant bag & cup' },
    ],
  },
  'ugc-commercial-152': {
    title: 'Wardah · Everyday Dewy Routine',
    subtitle: '9:16 Hijab-Friendly Beauty UGC',
    prompt:
      'Film a fresh, radiant 9:16 Get-Ready-With-Me UGC reel for Wardah: a smiling creator in soft pastel hijab tones applies lightweight hydrating sunscreen and sheer tinted lip balm by a sunlit bedroom mirror, demonstrating zero white-cast absorption and effortless natural daytime glow.',
    promptExtra:
      'Soft clean morning vanity light, honest close-up texture blend showing zero white-cast, gentle pastel wardrobe harmony, warm trustworthy tone.',
    assistantLead:
      'I will showcase real lightweight texture blend and effortless natural glow in authentic sunlit mirror lighting.',
    actions: [
      { title: 'Apply "Zero-White-Cast Blend Proof"', meta: 'Close-up sunlit cheek blend showing smooth finish' },
      { title: 'Layer "Sheer Tinted Lip Glow"', meta: 'Effortless mirror swipe + fresh daytime smile' },
      { title: 'Hold "GRWM Ready-to-Go Finale"', meta: 'Confident final look showing hero Wardah pack' },
    ],
  },
  'ugc-commercial-163': {
    title: 'Lookbook · Studio Photoshoot BTS',
    subtitle: '16:9 Fashion Campaign UGC',
    prompt:
      'Shoot a stylish 16:9 behind-the-scenes fashion photoshoot film: follow a charismatic model striking fluid poses against a sunlit cyclorama wall as strobe flashes fire rhythmically, intercutting candid Polaroid checks, wind-blown tailoring adjustments, and crisp finished editorial frames.',
    promptExtra:
      'Crisp studio flash pops, candid handheld documentary motion, refined editorial color palette, vibrant creative-team energy.',
    assistantLead:
      'I will intercut kinetic behind-the-scenes movement with freeze-frame editorial hero stills for a high-fashion lookbook feel.',
    actions: [
      { title: 'Capture "Strobe-Lit Runway Poses"', meta: 'Dynamic model movement + crisp flash highlights' },
      { title: 'Cut "Candid BTS Styling Moments"', meta: 'Quick handheld glimpses of racks & camera monitor' },
      { title: 'Freeze "Editorial Lookbook Stills"', meta: 'Punchy shutter-click frame locks on hero outfits' },
    ],
  },

  // =========================================================================
  // AFFILIATE UGC (Ads Agent & UGC — Affiliate)
  // =========================================================================
  'affiliate-ugc-73': {
    title: 'Lazada Finds · Curated Fashion Haul',
    subtitle: '9:16 Marketplace Fashion Affiliate',
    prompt:
      'Film a crisp 9:16 Lazada fashion affiliate haul: open with a bright creator unboxing three neatly folded seasonal wardrobe staples on a sunlit rug, cutting briskly into full-length try-on spins that showcase flattering tailoring, soft breathable fabric close-ups, and effortless mix-and-match styling.',
    promptExtra:
      'Clean bright daylight room, snappy 1.5-second try-on cuts, crisp fabric pinch close-ups, trustworthy shopper-friendly delivery.',
    assistantLead:
      'I will keep each try-on cut fast and clear so viewers can inspect fit, length, and fabric quality immediately.',
    actions: [
      { title: 'Hook "3-Piece Fashion Haul Unpack"', meta: 'Bright sunlit opening showing curated palette' },
      { title: 'Try-On "Full-Length Fit & Spin"', meta: 'Clean mirror angle demonstrating drape & comfort' },
      { title: 'Pinch "Fabric Quality Macro"', meta: 'Up-close stitching & breathable weave inspection' },
    ],
  },
  'affiliate-ugc-82': {
    title: 'Press-On Nail Art · 2-Minute Mani',
    subtitle: '9:16 Beauty Affiliate Demo',
    prompt:
      'Produce a super-satisfying 9:16 beauty affiliate demo for salon-grade press-on nails: open on a crisp macro view of glossy glazed-pearl nail tips arranged in a sleek tray, demonstrate the effortless 5-second press-and-hold application in bright vanity light, and finish with a shimmering hand reveal holding an iced latte.',
    promptExtra:
      'Razor-sharp macro hand lighting, glossy pearl specular shine, brisk step-by-step jump cuts, aesthetic Pinterest-clean manicure framing.',
    assistantLead:
      'I will keep every finger close-up razor sharp so the salon-quality shine and easy application sell themselves.',
    actions: [
      { title: 'Macro "Glazed-Pearl Nail Tray"', meta: 'Crisp sunlit vanity close-up on glossy tips' },
      { title: 'Demo "Effortless Press-On Fit"', meta: 'Quick clean press-and-lock application beat' },
      { title: 'Flex "Iced Latte Manicure Reveal"', meta: 'Shimmering finished hands in natural daylight' },
    ],
  },
  'affiliate-ugc-74': {
    title: 'Shopee Best-Seller · Daily Gadget Find',
    subtitle: '9:16 Viral Product Affiliate',
    prompt:
      'Create a punchy 9:16 Shopee affiliate discovery reel spotlighting a clever everyday lifestyle product: lead with a 2-second visual curiosity hook showing the gadget solving clutter instantly, glide through three rapid practical features in real room lighting, and finish with a clean hands-on size comparison.',
    promptExtra:
      'Crisp natural home lighting, fast visual proof beats, clear uncluttered desk surface, high-retention marketplace pacing.',
    assistantLead:
      'I will open straight on the problem-solving action so shoppers grasp the product’s utility before a single second is wasted.',
    actions: [
      { title: 'Hook "Instant Problem-Solved Demo"', meta: '0–2s crisp visual payoff on clean desk' },
      { title: 'Highlight "3 Key Practical Features"', meta: 'Tight close-ups of clicks, folds & build quality' },
      { title: 'Wrap "Everyday Value Summary"', meta: 'Clean product hold in sunlit room' },
    ],
  },
  'affiliate-ugc-86': {
    title: 'Shopee Style · Capsule Wardrobe',
    subtitle: '9:16 Affordable Chic Try-On',
    prompt:
      'Shoot an inspiring 9:16 capsule-wardrobe affiliate reel featuring versatile neutral basics—a tailored knit cardigan, pleated wide-leg trousers, and structured mini tote—styled three different ways for campus, brunch, and evening strolls in soft sunlit window framing.',
    promptExtra:
      'Warm cream-and-camel neutral palette, steady tripod try-on framing, smooth outfit wipe transitions, approachable chic tone.',
    assistantLead:
      'I will highlight how effortlessly the pieces pair together so viewers see immediate wardrobe versatility.',
    actions: [
      { title: 'Show "3-Way Styling Breakdown"', meta: 'Seamless transition across casual, work & brunch' },
      { title: 'Detail "Knit & Pleat Texture Macro"', meta: 'Close-up fabric movement in warm daylight' },
      { title: 'Frame "Structured Tote Finishing Touch"', meta: 'Complete head-to-toe silhouette spin' },
    ],
  },
  'affiliate-ugc-78': {
    title: 'Lazada Smart Find · Home Upgrade',
    subtitle: '9:16 Home & Lifestyle Affiliate',
    prompt:
      'Direct a clean, satisfying 9:16 home-upgrade affiliate clip showing a sleek countertop organizer transforming a messy kitchen corner into a Pinterest-worthy coffee station in five crisp, rhythmic tidy-up cuts under warm morning daylight.',
    promptExtra:
      'Before-and-after transformation clarity, tactile placement clicks, warm clean architectural kitchen lighting, soothing tidy-up momentum.',
    assistantLead:
      'I will contrast a relatable cluttered counter with a crisp, satisfying transformation into a serene organized nook.',
    actions: [
      { title: 'Contrast "Before Clutter Quick-Hook"', meta: 'Relatable 1.5s crowded countertop glance' },
      { title: 'Assemble "Snap-Fit Organize Sequence"', meta: 'Rhythmic rhythmic clicks placing mugs & jars' },
      { title: 'Admire "Clean Coffee-Nook After"', meta: 'Slow sunlit pan across spotless upgraded corner' },
    ],
  },
  'affiliate-ugc-80': {
    title: 'Kids Watch · Playful Gift Find',
    subtitle: '9:16 Kids Accessory Affiliate',
    prompt:
      'Film a bright, cheerful 9:16 affiliate spotlight for a colorful shock-resistant kids wristwatch: showcase the soft flexible silicone strap, bright easy-to-read glowing dial pressed in a crisp close-up, and a playful splash-resistance test under running sink water before strapping comfortably onto a smiling wrist.',
    promptExtra:
      'Bright cheerful daylight, crisp macro dial clarity, playful water-droplet proof beat, warm parent-friendly trust tone.',
    assistantLead:
      'I will demonstrate durability, comfort, and easy readability—the exact three details parents check before buying.',
    actions: [
      { title: 'Macro "Glowing Dial & Soft Strap"', meta: 'Flexible silicone bend + crisp illuminated numbers' },
      { title: 'Test "Splash-Proof Water Proof"', meta: 'Clean faucet droplet test with crystal dial clarity' },
      { title: 'Fit "Wrist Comfort & Gift Reveal"', meta: 'Snug colorful buckle fit in bright daylight' },
    ],
  },
  'affiliate-ugc-79': {
    title: 'Hijab Silk · Effortless Drape Reel',
    subtitle: '9:16 Modest Fashion Affiliate',
    prompt:
      'Direct an elegant 9:16 modest-fashion affiliate tutorial showcasing a featherlight modal-silk hijab: open on a graceful close-up of the fabric gliding effortlessly across sunlit fingers, demonstrate a 10-second no-slip neat forehead arch in front of a bright vanity mirror, and pan across five curated pastel colorways.',
    promptExtra:
      'Soft luminous daylight, accurate fabric sheen and opacity visibility, gentle fluid styling movements, serene boutique aesthetic.',
    assistantLead:
      'I will highlight effortless drape, breathable softness, and true-to-life colorway swatches in clean natural light.',
    actions: [
      { title: 'Feel "Featherlight Silk Drape Macro"', meta: 'Sunlit flow showing soft sheen & non-sheer weave' },
      { title: 'Style "10-Second Neat Arch Tutorial"', meta: 'Clean mirror-angle wrap staying effortlessly crisp' },
      { title: 'Swatch "Curated Pastel Color Fan"', meta: 'True-color sunlit display of top 5 shades' },
    ],
  },
  'affiliate-ugc-83': {
    title: 'Fashion Mix · 4-Look Street Reel',
    subtitle: '9:16 Multi-Outfit Style Affiliate',
    prompt:
      'Produce an energetic 9:16 street-style mix-and-match affiliate reel: a stylish creator steps past sunlit urban storefronts, effortlessly remixing one structured blazer across four distinct looks—monochrome tailored, sporty sneaker casual, layered midi dress, and weekend denim.',
    promptExtra:
      'Crisp golden-hour street light, beat-matched walk transitions, full-body framing with clean garment motion.',
    assistantLead:
      'I will pace four distinct street looks around one hero piece so shoppers see immediate cost-per-wear value.',
    actions: [
      { title: 'Anchor "One Blazer, Four Looks Hook"', meta: 'Snappy street-walk entry showing hero tailoring' },
      { title: 'Cut "Beat-Matched Outfit Remix"', meta: 'Four seamless stride transitions across settings' },
      { title: 'Highlight "Close-Up Lapel & Button Craft"', meta: 'Quick sunlit detail pass on structured fit' },
    ],
  },
  'affiliate-ugc-71': {
    title: 'Boutique Try-On · Everyday Chic',
    subtitle: '9:16 Soft-Daylight Fashion Affiliate',
    prompt:
      'Film a breezy 9:16 try-on haul inside a bright cream-walled dressing studio: showcase a flowy tiered midi dress with gentle twirl movement, zoom smoothly into delicate smocked waist stitching and lined breathable cotton, and pair it effortlessly with woven sandals and a mini sling bag.',
    promptExtra:
      'Airy daylight studio warmth, crisp natural fabric movement, flattering full-length framing, relaxed boutique charm.',
    assistantLead:
      'I will spotlight movement, comfort, and breathable lining details so viewers feel confident about the fit.',
    actions: [
      { title: 'Twirl "Flowy Midi Skirt Movement"', meta: 'Bright airy studio showing graceful hem drape' },
      { title: 'Inspect "Smocked Waist & Cotton Lining"', meta: 'Close-up stretch & opacity reassurance check' },
      { title: 'Pair "Complete Weekend Styling"', meta: 'Clean full-frame look with sandals & sling bag' },
    ],
  },
  'affiliate-ugc-81': {
    title: 'Lazada Skincare · Glass-Skin Duo',
    subtitle: '9:16 Skincare Routine Affiliate',
    prompt:
      'Direct a fresh 9:16 skincare affiliate routine showcasing a soothing toner-and-moisturizer duo: open with crisp clear toner patting gently onto clean skin, spread airy gel-cream across the back of the hand to prove instant non-sticky absorption, and finish with a sunlit glass-skin cheek tilt.',
    promptExtra:
      'Clean bathroom daylight, razor-sharp watery gel texture macro, honest pore-friendly skin glow, calm instructional cadence.',
    assistantLead:
      'I will prove the featherlight non-sticky texture up close so skincare buyers trust how it wears under humid weather.',
    actions: [
      { title: 'Swatch "Watery Gel-Cream Texture"', meta: 'Macro back-of-hand glide showing instant melt' },
      { title: 'Pat "Two-Step Morning Hydration"', meta: 'Clean mirror application in soft window light' },
      { title: 'Tilt "Sunlit Glass-Skin Proof"', meta: 'Luminous bounce glow with hero bottles framed' },
    ],
  },
  'affiliate-ugc-84': {
    title: 'Skincare Mix · Shelfie Essentials',
    subtitle: '9:16 Curated Beauty Shelf Affiliate',
    prompt:
      'Create an aesthetic 9:16 skincare "shelfie" roundup on a sunlit marble bathroom counter: line up four complementary daily heroes—gentle cleanser, brightening serum, barrier cream, and airy SPF—tapping each cap rhythmically as quick close-up texture swirls pop onto screen.',
    promptExtra:
      'Crisp morning tile-and-marble lighting, satisfying rhythmic cap taps, four distinct macro texture swatches, clean luxury-meets-accessible look.',
    assistantLead:
      'I will structure each product with its own crisp macro texture reveal so the four-step routine feels effortless to follow.',
    actions: [
      { title: 'Stage "Sunlit Marble Shelfie Lineup"', meta: 'Clean 4-bottle arrangement in morning light' },
      { title: 'Swatch "4-Texture Macro Montage"', meta: 'Foam → watery drop → rich cream → invisible SPF' },
      { title: 'Close "Complete Daily Routine Glow"', meta: 'Fresh smiling creator holding hero set' },
    ],
  },
  'affiliate-ugc-85': {
    title: 'Elendee Soft Foam · Cloud-Step Test',
    subtitle: '9:16 Comfort Footwear Affiliate',
    prompt:
      'Produce a tactile 9:16 comfort-proof affiliate reel for Elendee Soft Foam sandals: open on an unmistakable close-up thumb-press sinking deep into the ultra-plush cushioned footbed and bouncing right back, cut to effortless all-day walking steps across city pavement, and show off clean neutral colorways.',
    promptExtra:
      'Crisp close-up foam-rebound proof, sunlit floor angles, clean modern minimalist styling, high-trust comfort demonstration.',
    assistantLead:
      'I will lead with the tactile thumb-press bounce test so viewers can practically feel the cloud-soft cushioning.',
    actions: [
      { title: 'Press "Cloud-Foam Rebound Macro"', meta: 'Close-up thumb compression proving plush bounce' },
      { title: 'Step "Effortless Pavement Walk Test"', meta: 'Low tracking shot showing flexible arch support' },
      { title: 'Compare "Neutral Colorway Lineup"', meta: 'Clean overhead fan of beige, oat & obsidian pairs' },
    ],
  },
  'affiliate-ugc-75': {
    title: 'Daily Chic · Work-to-Weekend Edit',
    subtitle: '9:16 Versatile Fashion Affiliate',
    prompt:
      'Shoot a polished 9:16 fashion affiliate edit demonstrating how one crisp tailored vest-and-trouser set transitions effortlessly from morning office presentations (paired with pointed flats and a leather tote) to relaxed Friday dinner (swapped to gold hoops and strappy heels).',
    promptExtra:
      'Clean sunlit loft backdrop, seamless outfit accessory swap cut, sharp tailoring drape clarity, modern urban professional vibe.',
    assistantLead:
      'I will highlight clean tailoring lines and a snappy day-to-night accessory switch for instant style appeal.',
    actions: [
      { title: 'Present "Crisp Office Tailoring Fit"', meta: 'Clean full-length posture showing structured drape' },
      { title: 'Swap "Day-to-Night Accessory Cut"', meta: 'Snappy transition to gold hoops & evening bag' },
      { title: 'Close "Confident Doorway Stride"', meta: 'Warm golden light framing finished silhouette' },
    ],
  },
  'affiliate-ugc-77': {
    title: 'Shopee Haul · Aesthetic Unbox',
    subtitle: '9:16 Curated Lifestyle Haul',
    prompt:
      'Film a cozy, crisp 9:16 Shopee lifestyle haul on a sunlit pale-wood table: unbox five affordable aesthetic desk and wardrobe upgrades one by one with satisfying tear-and-click sound beats, finishing with an overhead hero shot showing every piece styled harmoniously in the room.',
    promptExtra:
      'Warm Scandinavian natural light, crisp tabletop macro shots, snappy satisfying unboxing cadence, inviting creator aesthetic.',
    assistantLead:
      'I will give each of the five finds a crisp 2-second visual reveal leading up to a cohesive room-styling finale.',
    actions: [
      { title: 'Unbox "5-Piece Aesthetic Parcel Open"', meta: 'Crisp sunlit table reveal with snappy pacing' },
      { title: 'Inspect "Hero Detail Close-Ups"', meta: 'Quick tactile texture & finish checks per item' },
      { title: 'Style "Harmonious Room Finale"', meta: 'Wide sunlit sweep showing all pieces in place' },
    ],
  },

  // =========================================================================
  // FOOD & DRINK (Ads Agent & UGC — Food & Drink)
  // =========================================================================
  'ads-fnb-70': {
    title: 'Culinary Feast · Tabletop Cinema',
    subtitle: '9:16 High-Speed F&B Commercial',
    prompt:
      'Direct a mouthwatering 9:16 culinary campaign montage: open on caramelized glaze cascading in slow motion over crispy roasted dishes, cut to fresh herbs fluttering down onto steaming cast-iron skillets, and finish on a lush candlelit hero feast spread bursting with vibrant color and texture.',
    promptExtra:
      'Rich warm restaurant lighting, 120fps sauce-pour and garnish macros, crisp backlit steam plumes, sumptuous appetizing color grade.',
    assistantLead:
      'I will orchestrate high-speed garnish drops, glossy sauce pours, and rich steam lighting to maximize appetite appeal.',
    actions: [
      { title: 'Pour "Slow-Motion Caramelized Glaze"', meta: '100mm macro sheen over crisp golden crust' },
      { title: 'Drop "Fresh Herb & Spice Garnish"', meta: '120fps falling herbs into warm skillet steam' },
      { title: 'Reveal "Candlelit Feast Tabletop"', meta: 'Slow overhead push-in across signature spread' },
    ],
  },
  'ads-fnb-69': {
    title: 'Burger King · Flame-Grilled Stack',
    subtitle: '9:16 Flame-Grilled Burger Spot',
    prompt:
      'Shoot an explosive 9:16 flame-grilled commercial for Burger King: searing orange grill flames lick upward beneath a juicy char-marked beef patty, cutting to melted cheddar draping warmly over the edges as crisp lettuce, ruby tomatoes, tangy sauce, and a toasted sesame crown drop together in dramatic 120fps slow motion.',
    promptExtra:
      'Dramatic dark-charcoal studio backdrop, roaring real flame highlights, juicy glossy sear texture, punchy sizzle and crunch rhythm.',
    assistantLead:
      'I will focus on real flame-kissed char marks, glowing embers, and a towering high-speed ingredient stack.',
    actions: [
      { title: 'Sear "Open-Flame Grill Sizzle"', meta: '120fps roaring embers + juicy beef char macro' },
      { title: 'Stack "Slow-Motion Ingredient Drop"', meta: 'Melted cheddar drape, crisp greens & sesame bun' },
      { title: 'Lock "Towering Flame-Grilled Hero"', meta: 'Rising smoke veil behind bold burger silhouette' },
    ],
  },
  'ads-fnb-65': {
    title: 'Wood-Fired Pizza · Molten Slice',
    subtitle: '9:16 Artisan Pizzeria Commercial',
    prompt:
      'Direct an irresistible 9:16 wood-fired pizza commercial: peek inside a glowing brick oven as blistered sourdough crust bubbles beside bubbling San Marzano tomato sauce and melting fior di latte, then slice cleanly through the crisp edge and lift a steaming golden triangle with an epic stretchy cheese pull.',
    promptExtra:
      'Warm brick-oven fire glow, crisp flour-dusted peel details, glossy olive-oil basil drizzle, rich appetizing shadows.',
    assistantLead:
      'I will build from glowing brick-oven blisters straight into a razor-crisp slice and decadent molten cheese lift.',
    actions: [
      { title: 'Bake "Glowing Brick-Oven Bubble"', meta: 'Blistering sourdough crust & sizzling mozzarella' },
      { title: 'Drizzle "Fresh Basil & Chili Oil"', meta: 'Macro glossy droplets across piping hot pie' },
      { title: 'Lift "Epic Stretchy Cheese Pull"', meta: 'Slow-motion slice pull backlit by warm steam' },
    ],
  },
  'ads-fnb-67': {
    title: 'Smash Burger · Crispy Sear Macro',
    subtitle: '9:16 Street-Gourmet Burger Ad',
    prompt:
      'Film a gritty, hyper-appetizing 9:16 gourmet smash-burger spot: press a seasoned beef ball onto a smoking hot griddle to unleash lacy crispy brown edges and glistening juices, double-stack with gooey American cheese and house smoky sauce inside a buttery toasted brioche bun, and slice diagonally for a dramatic cross-section reveal.',
    promptExtra:
      'Close-up flat-top griddle sizzle, warm diner tungsten highlights, crisp toasted brioche sheen, juicy cross-section macro.',
    assistantLead:
      'I will spotlight the crispy lacy sear, buttery toasted brioche, and juicy double-stack cross-section.',
    actions: [
      { title: 'Smash "Smoking Griddle Lacy Sear"', meta: 'High-speed sizzle burst + caramelized crisp edge' },
      { title: 'Sauce "Brioche Double-Stack Build"', meta: 'Glossy sauce drizzle over melted double cheddar' },
      { title: 'Reveal "Juicy Diagonal Cross-Section"', meta: 'Clean slow-motion pull-apart hero frame' },
    ],
  },
  'ads-fnb-68': {
    title: 'Al Dente Spaghetti · Trattoria Twirl',
    subtitle: '9:16 Italian Culinary Commercial',
    prompt:
      'Direct a lush 9:16 Italian trattoria commercial: glossy al dente spaghetti strands toss effortlessly in a copper pan of velvety slow-simmered tomato basil sauce, followed by a hypnotic slow-motion fork twirl dusted with snowfall-like aged Parmigiano-Reggiano and fragrant fresh basil leaves.',
    promptExtra:
      'Warm Tuscan candlelit wood table, backlit falling parmesan flakes, rich crimson-and-gold sauce sheen, sumptuous slow-motion pacing.',
    assistantLead:
      'I will pair rhythmic copper-pan sauce tossing with a dreamy slow-motion parmesan snowfall over the hero twirl.',
    actions: [
      { title: 'Toss "Copper-Pan Tomato Emulsion"', meta: '120fps glossy pasta wave + swirling steam' },
      { title: 'Grate "Parmigiano Snowfall Macro"', meta: 'Backlit fine cheese flakes drifting onto crimson sauce' },
      { title: 'Twirl "Hero Fork Lift Close-Up"', meta: 'Glossy al dente strands with crisp basil accent' },
    ],
  },
};
