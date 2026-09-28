# Missing Asset — Image-to-Image Prompts

Workflow: upload the **Reference image** named in each section, then paste the matching **Image-to-image prompt** and **Negative prompt**. Each generation creates one clean support asset for `03-the-wonder-stays-with-you-emotional-seedance25.txt`.

---

## 1. Family Character Master

### Asset name
`@FamilyCharacterMaster`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15 (2).jpeg`

### Reference image description
A family walking together on a bamboo-lined Bali Zoo path. This is the main family identity, wardrobe, and tropical-path reference.

### Why this asset is needed
The supplied walking photo does not show every family face clearly enough for stable reuse across multiple video shots. This creates a clean master plate for family identity consistency.

### Image-to-image prompt
```text
Use the uploaded family walking photo as the strict identity and wardrobe reference for the entire family. Preserve every visible family member's face, age appearance, skin tone, hairstyle, body proportions, relationships, and clothing silhouette exactly as in the source image. Keep the exact same number of people.

Create a polished photorealistic editorial family portrait in a clean tropical Bali Zoo walkway. The family stands naturally close together, facing camera in a relaxed candid pose, with warm dappled daylight, bamboo fencing, stone path, and lush green foliage softly blurred behind them. Make every face clearly visible and separately identifiable, with natural hands, realistic skin texture, calm genuine expressions, and consistent wardrobe.

This is a high-resolution master character-reference plate for a cinematic Bali Zoo brand film.
```

### Negative prompt
```text
No animals, crowds, text, logo, watermark, altered identity, altered outfit color, duplicated people, obscured faces, distorted hands, beauty-filter skin, exaggerated fashion pose, or cartoon style.
```

### Used later in video
Family identity reference for Shot 2, Shot 4, and Shot 6.

---

## 2. Child Wonder Close-Up

### Asset name
`@ChildWonderCloseUp`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15 (1).jpeg`

### Reference image description
A young child with a parent at a rope/play structure. The child has curly hair and a green outfit; this is the emotional child-identity reference.

### Why this asset is needed
It produces a clean cinematic opening plate that isolates the child’s expression from the busy playground scene.

### Image-to-image prompt
```text
Use the uploaded child-and-parent playground photo as the strict identity reference.

Select the child as the main subject. Preserve the child’s exact facial identity, age appearance, curly hair, skin tone, body proportions, and green outfit. Do not replace the child with a different child.

Create a photorealistic close-up portrait of the same child in a tropical Bali Zoo environment. The child is in three-quarter profile, looking slightly upward with quiet wonder and a small natural smile. Warm daylight catches the child’s eyes. The background is soft green tropical foliage with shallow depth of field. A parent’s shoulder or hand may appear subtly out of focus at the edge of the frame to create safety and warmth.

The mood is emotional, premium, natural, and publishable as the opening frame of a Bali Zoo brand film.
```

### Negative prompt
```text
No animals, text, logo, watermark, exaggerated smile, crying, changed face, changed hair, changed clothing, extra fingers, duplicate child, cartoon look, or plastic skin.
```

### Used later in video
Shot 1 — The look of wonder.

---

## 3. Parent-and-Child Connection

### Asset name
`@ParentChildConnection`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15 (1).jpeg`

### Reference image description
The same parent-and-child playground photo. It provides the identity, wardrobe, and genuine parent-child relationship.

### Why this asset is needed
This is a backup emotional insert for the edit, useful if Shot 4 needs more human connection and less animal footage.

### Image-to-image prompt
```text
Use the uploaded child-and-parent playground photo as the strict identity and wardrobe reference.

Preserve the same child and parent exactly: face, skin tone, hairstyle, age appearance, body proportions, clothing, and natural relationship. Do not introduce new people.

Create a photorealistic medium close-up of the parent and child sharing a quiet emotional moment in a tropical Bali Zoo pathway. The parent leans gently toward the child, and the child looks back with a soft natural smile. Warm dappled daylight falls across their faces. Bamboo and lush foliage form a softly blurred background.

The image should feel candid, protective, tender, and premium—like a family travel brand film frame. Both faces are visible and sharp.
```

### Negative prompt
```text
No animals, crowds, text, logo, watermark, changed faces, changed clothes, exaggerated pose, distorted hands, duplicate child, extra people in clear focus, or cartoon style.
```

### Used later in video
Optional emotional cutaway between Shot 3 and Shot 5.

---

## 4. Empty Tropical Path / Establishing Plate

### Asset name
`@TropicalPathEmptyPlate`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15 (2).jpeg`

### Reference image description
The family walking on a bamboo-lined path. For this generation, use only the path materials, bamboo fence, trees, foliage, and daylight; remove the family.

### Why this asset is needed
This gives the final edit a quiet location-establishing shot and a flexible transition plate without forcing a new generic tropical location.

### Image-to-image prompt
```text
Use the uploaded Bali Zoo family walking image only as the location reference. Do not use any person from the source.

Remove all people from the scene. Preserve the bamboo-lined pathway, stone path, tropical greenery, warm dappled daylight, and calm Bali Zoo atmosphere.

Create a photorealistic empty tropical zoo pathway plate. The path curves gently forward through bamboo fencing and lush foliage. Keep the composition clean and cinematic with soft golden light and natural shadows. Leave clean negative space in the upper center or upper right for official Bali Zoo logo and text to be added manually in post-production.
```

### Negative prompt
```text
No people, animals, crowds, text, logo, watermark, fake buildings, fantasy plants, dramatic fog, neon colors, or cartoon look.
```

### Used later in video
Optional establishing frame before Shot 1, transition before Shot 2, or background/end-card plate.

---

## 5. Family Closing Plate

### Asset name
`@FamilyClosingPlate`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15 (2).jpeg`

### Reference image description
The same family walking along the bamboo path. It defines the exact family count, wardrobe, path, and Bali Zoo family-day atmosphere.

### Why this asset is needed
The source photo faces camera. The final film needs a rear three-quarter view of the same family walking away, leaving clean space for a manually added Bali Zoo end card.

### Image-to-image prompt
```text
Use the uploaded family walking photo as the strict identity, family-count, wardrobe, and pathway reference.

Preserve the same family members, same clothing, same body proportions, and same relationship. Do not add or remove anyone.

Create a photorealistic rear three-quarter wide image of the same family walking away together along the Bali Zoo bamboo pathway in warm late-afternoon light. The family is naturally grouped in the lower third of the frame, surrounded by bamboo fencing and lush tropical foliage. Their faces do not need to face camera, but their body proportions, outfits, and family count must remain consistent.

Keep the upper center of the frame clean with natural negative space for official Bali Zoo typography or logo added manually in post-production. The mood is quiet, warm, emotional, and complete.
```

### Negative prompt
```text
No animals, crowds, readable signs, text, logo, watermark, new people, changed wardrobe, fake buildings, fantasy effects, oversaturated sunset, or cartoon style.
```

### Used later in video
Shot 6 — Emotional closing.

---

## 6. Baby Orangutan Emotional Portrait

### Asset name
`@BabyOrangutanPortrait`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15.jpeg`

### Reference image description
A close-up baby orangutan, with large expressive eyes and reddish-brown fur around it. This is the only orangutan identity reference in the current set.

### Why this asset is needed
The source is already useful, but this makes a clean cinematic portrait with better lighting and composition for the emotional match cut with the child’s eyes.

### Image-to-image prompt
```text
Use the uploaded baby orangutan image as the strict animal identity reference.

Preserve the baby orangutan’s face, eye shape, fur color, fur texture, age appearance, small body scale, and natural anatomy. Do not transform it into an adult orangutan.

Create a photorealistic emotional close-up of the same baby orangutan nestled safely in a natural tropical habitat context. Warm morning light catches the eyes. The background is soft green foliage and warm reddish-brown fur texture, with shallow depth of field. The baby orangutan looks calm, curious, and natural.

This should feel like a quiet memory fragment in a premium Bali Zoo brand film.
```

### Negative prompt
```text
No people, text, logo, watermark, human-like pose, smile aimed at camera, aggressive expression, duplicate orangutans, altered anatomy, adult orangutan, cages in foreground, or cartoon look.
```

### Used later in video
Shot 3 — A quiet encounter.

---

## 7. Orangutan Habitat Wide Plate

### Asset name
`@OrangutanHabitatWide`

### Reference image
Primary: `C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.15.jpeg` — baby orangutan identity.

Recommended second reference that you still need: an official Bali Zoo photo of the real orangutan habitat — use it for habitat layout, wooden structures, foliage, and light.

### Reference image description
Current image gives only the baby orangutan identity. It does **not** show enough of the habitat. A second real habitat photo is required for an accurate Bali Zoo wide shot.

### Why this asset is needed
This provides location context for the orangutan scene, so the video does not feel like a floating close-up animal portrait.

### Image-to-image prompt
```text
Use the uploaded baby orangutan image only for the baby orangutan’s face, fur, scale, and natural anatomy. Use the uploaded official habitat image only for the real habitat layout, vegetation, wooden platform materials, and lighting. Do not use people from either source.

Create a photorealistic wide tropical orangutan habitat plate. The same baby orangutan is naturally positioned on a low wooden platform or safe habitat area, small in the composition with ample environmental context. Use warm morning light, natural green depth, wood, leaves, and realistic habitat scale. Keep the baby’s behavior calm and natural.

This is a location-plus-animal continuity plate for the cinematic brand film.
```

### Negative prompt
```text
No people, breakfast table, cages in foreground, text, logo, adult orangutan unless separately referenced, human-like gestures, animal distress, duplicate orangutans, distorted anatomy, or cartoon look.
```

### Used later in video
Optional wide lead-in before Shot 3.

---

## 8. Simplified Family Bird Encounter

### Asset name
`@FamilyBirdEncounterClose`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.16 (1).jpeg`

### Reference image description
A family is interacting with colorful birds in front of a colorful Bali Zoo mural. The source contains several birds and a busy background.

### Why this asset is needed
The original photo is visually busy. This makes a more intimate version with only one or two birds, keeping the final emotional film focused on the child-family reaction.

### Image-to-image prompt
```text
Use the uploaded family bird encounter photo as the strict identity, wardrobe, bird, and mural-atmosphere reference.

Preserve the same family members, faces, hairstyles, clothing, body proportions, and family count. Preserve the birds’ visible colors, size, and calm perch behavior. Keep the colorful Bali Zoo mural atmosphere as a soft background reference, but do not generate readable text or exact logo lettering.

Create a photorealistic intimate medium shot focused on the child’s emotional reaction. Show only one or two birds clearly, perched calmly on a parent’s hand or arm as supported by the source image. The child looks from the bird back to the parent with a gentle smile. The family stands close together in warm daylight. The composition should feel emotional and uncluttered, not like a busy animal showcase.
```

### Negative prompt
```text
No extra birds, extra people, changed faces, changed outfits, aggressive wing flapping, birds on faces, text, logo, watermark, distorted hands, or cartoon look.
```

### Used later in video
Shot 4 — Shared reaction. Optional; replace with `@ParentChildConnection` if you want even less animal content.

---

## 9. Waterplay Joy Close-Up

### Asset name
`@WaterplayJoyClose`

### Reference image
`C:\Users\PC\Pictures\balizoo\WhatsApp Image 2026-09-25 at 03.48.16.jpeg`

### Reference image description
Children play in a shallow splash/waterplay area, with bright daylight and big water splashes. It is a fun visual, but the original has several children and a busy action frame.

### Why this asset is needed
This creates a cleaner, more cinematic emotional-climax image focused on one child’s laugh rather than a crowded waterplay image.

### Image-to-image prompt
```text
Use the uploaded waterplay image as the action, lighting, water-splash, and child-energy reference.

Preserve the natural feeling of children laughing in bright waterplay sunlight. If the visible children are meant to define a specific identity, preserve their faces, age appearance, body proportions, and swimwear exactly; otherwise use the source only for action and environment, not as the same family identity.

Create a photorealistic child-height close action plate of one or two children laughing as sunlight catches a gentle water splash. The background is a softly blurred waterplay structure and bright outdoor light. Focus on genuine joy, sparkling water droplets, and warm family-friendly energy. The image should feel cinematic and publishable, not chaotic.
```

### Negative prompt
```text
No nudity, inappropriate framing, crowd, text, logo, watermark, exaggerated water explosion, unsafe activity, distorted limbs, duplicate children, or cartoon look.
```

### Used later in video
Shot 5 — Joy that remains.

---

## 10. Entrance Hero Plate — Waiting for Your New Entrance Image

### Asset name
`@BaliZooEntranceHeroPlate`

### Reference image
Not available yet. Use the clean real Bali Zoo entrance photo you plan to collect from Google or, ideally, an official Bali Zoo source.

### What the reference image should show
A wide, clear view of the Bali Zoo entrance or main sign, ideally daytime, with minimal visitors, visible architecture, plants, stone textures, and enough open sky/foliage for manual end-card typography.

### Why this asset is needed
It provides a strong clear establishing or final brand-location shot. It is optional because `@FamilyClosingPlate` can close the first version.

### Image-to-image prompt
```text
Use the uploaded real Bali Zoo entrance image only for the actual entrance architecture, stone textures, vegetation, sign placement, and daylight conditions. Preserve the authentic entrance layout. Do not attempt to generate readable sign text or logo.

Create a photorealistic premium wide establishing plate of the same Bali Zoo entrance in warm early-morning or late-afternoon tropical light. Keep the entrance architecture and landscaping authentic. Leave clean negative space in the sky or foliage for official Bali Zoo logo and text to be added manually in post-production. Keep visitors absent or minimal unless they are clearly required by the original composition.
```

### Negative prompt
```text
No invented buildings, altered entrance layout, readable generated logo/text, crowds, fake animals, watermark, fantasy effects, or cartoon styling.
```

### Used later in video
Optional opening or final end-card plate.
