import assert from 'node:assert/strict'
import test from 'node:test'

import { compileMentionsForModel, type FolderType } from './mention-prompt'
import { getModelById } from './fal-models'

const model = getModelById('nano-banana-pro')

function compile(type: FolderType) {
  const name = type === 'character' ? 'Nathan' : type === 'prop' ? 'Hero Sword' : 'Jakarta Studio'
  return compileMentionsForModel(
    `Place @${name.replace(/\s+/g, '-')} in a new shot`,
    [{ folderId: `${type}-folder`, name, selectedAssetIds: [`${type}-asset`] }],
    [{
      id: `${type}-folder`, name, type,
      assets: [{ id: `${type}-asset`, workspaceAssetId: `workspace-${type}-asset`, r2_url: `/spite/api/r2-image/${type}.png` }],
    }],
    model,
  )
}

test('mentions resolve through canonical workspace asset IDs rather than legacy R2 URLs', () => {
  const result = compileMentionsForModel(
    '@Nathan walks into frame',
    [{ folderId: 'nathan', name: 'Nathan', selectedAssetIds: ['legacy-nathan'], selectedWorkspaceAssetIds: ['workspace-nathan'] }],
    [{ id: 'nathan', name: 'Nathan', type: 'character', assets: [{ id: 'legacy-nathan', workspaceAssetId: 'workspace-nathan', r2_url: '/spite/api/r2-image/nathan.png' }] }],
    model,
  )
  assert.deepEqual(result.refGroups[0].urls, ['/api/assets/workspace-nathan/download'])
  assert.deepEqual(result.refGroups[0].workspaceAssetIds, ['workspace-nathan'])
})

test('canonical mention metadata compiles even before the folder cache refreshes', () => {
  const result = compileMentionsForModel(
    '@Nathan walks into frame',
    [{ folderId: 'nathan', name: 'Nathan', selectedAssetIds: ['legacy-nathan'], selectedWorkspaceAssetIds: ['workspace-nathan'] }],
    [],
    model,
  )
  assert.deepEqual(result.refGroups[0].urls, ['/api/assets/workspace-nathan/download'])
  assert.deepEqual(result.refGroups[0].workspaceAssetIds, ['workspace-nathan'])
  assert.doesNotMatch(result.prompt, /@Nathan/)
})

test('partial canonical mention metadata keeps canonical assets without inventing trusted duplicates', () => {
  const result = compileMentionsForModel(
    '@Nathan walks into frame',
    [{
      folderId: 'nathan',
      name: 'Nathan',
      selectedAssetIds: ['legacy-front', 'legacy-side'],
      selectedWorkspaceAssetIds: ['workspace-front'],
    }],
    [],
    model,
  )
  assert.deepEqual(result.refGroups[0].urls, ['/api/assets/workspace-front/download'])
})

test('legacy-only mentions are sent as raw image references', () => {
  const result = compileMentionsForModel(
    '@Buratna walks into frame',
    [{ folderId: 'buratna', name: 'Buratna', selectedAssetIds: ['legacy-buratna'] }],
    [{ id: 'buratna', name: 'Buratna', type: 'character', assets: [{ id: 'legacy-buratna', r2_url: '/spite/api/r2-image/buratna.png' }] }],
    model,
  )
  assert.deepEqual(result.refGroups[0].urls, ['/spite/api/r2-image/buratna.png'])
  assert.deepEqual(result.refGroups[0].workspaceAssetIds, [])
})

test('character mentions demand the exact same identity', () => {
  const result = compile('character')
  assert.equal(result.refGroups.length, 1)
  assert.match(result.prompt, /exact same person\/character/i)
  assert.match(result.prompt, /preserve facial identity, facial structure, skin tone, hairstyle, and distinguishing features/i)
})

test('prop mentions demand the exact same object', () => {
  const result = compile('prop')
  assert.match(result.prompt, /exact same object/i)
  assert.match(result.prompt, /preserve its shape, geometry, materials, colors, markings, and distinguishing details/i)
})

test('location mentions demand the exact same place', () => {
  const result = compile('location')
  assert.match(result.prompt, /exact same location/i)
  assert.match(result.prompt, /preserve its spatial layout, architecture, landmarks, materials, and distinguishing details/i)
})

test('multiple mentions preserve every reference group and slot order', () => {
  const result = compileMentionsForModel(
    'Put @Nathan with @Hero-Sword inside @Jakarta-Studio',
    [
      { folderId: 'character-folder', name: 'Nathan', selectedAssetIds: ['face-front', 'face-side'] },
      { folderId: 'prop-folder', name: 'Hero Sword', selectedAssetIds: ['sword'] },
      { folderId: 'location-folder', name: 'Jakarta Studio', selectedAssetIds: ['studio'] },
    ],
    [
      {
        id: 'character-folder', name: 'Nathan', type: 'character',
        assets: [
          { id: 'face-front', workspaceAssetId: 'workspace-face-front', r2_url: '/spite/api/r2-image/face-front.png' },
          { id: 'face-side', workspaceAssetId: 'workspace-face-side', r2_url: '/spite/api/r2-image/face-side.png' },
        ],
      },
      {
        id: 'prop-folder', name: 'Hero Sword', type: 'prop',
        assets: [{ id: 'sword', workspaceAssetId: 'workspace-sword', r2_url: '/spite/api/r2-image/sword.png' }],
      },
      {
        id: 'location-folder', name: 'Jakarta Studio', type: 'location',
        assets: [{ id: 'studio', workspaceAssetId: 'workspace-studio', r2_url: '/spite/api/r2-image/studio.png' }],
      },
    ],
    model,
  )

  assert.deepEqual(result.refGroups.map((group) => group.urls), [
    ['/api/assets/workspace-face-front/download', '/api/assets/workspace-face-side/download'],
    ['/api/assets/workspace-sword/download'],
    ['/api/assets/workspace-studio/download'],
  ])
  assert.match(result.prompt, /reference images 1-2/)
  assert.match(result.prompt, /reference image 3/)
  assert.match(result.prompt, /reference image 4/)
  assert.match(result.prompt, /exact same person\/character/)
  assert.match(result.prompt, /exact same object/)
  assert.match(result.prompt, /exact same location/)
})

test('repeated mentions spell out the identity instruction only once', () => {
  const result = compileMentionsForModel(
    '@Nathan enters. @Nathan sits. @Nathan leaves.',
    [{ folderId: 'nathan', name: 'Nathan', selectedAssetIds: ['legacy-nathan'], selectedWorkspaceAssetIds: ['workspace-nathan'] }],
    [{ id: 'nathan', name: 'Nathan', type: 'character', assets: [{ id: 'legacy-nathan', workspaceAssetId: 'workspace-nathan', r2_url: '/spite/api/r2-image/nathan.png' }] }],
    model,
  )
  assert.equal(result.prompt.match(/exact same person\/character/g)?.length, 1)
  assert.match(result.prompt, /reference image 1 sits\. reference image 1 leaves\./)
})

test('a mentioned tag is not re-added from another folder with the same name', () => {
  const result = compileMentionsForModel(
    'Walk past @alur4 slowly',
    [{ folderId: 'loc-alur4', name: 'alur4', selectedAssetIds: ['a4'], selectedWorkspaceAssetIds: ['workspace-a4'] }],
    [
      { id: 'char-alur4', name: 'alur4', type: 'character', assets: [{ id: 'a4', workspaceAssetId: 'workspace-a4', r2_url: '/canvas/api/r2-image/a4.png' }] },
      { id: 'loc-alur4', name: 'alur4', type: 'location', assets: [{ id: 'a4', workspaceAssetId: 'workspace-a4', r2_url: '/canvas/api/r2-image/a4.png' }] },
    ],
    model,
  )
  assert.equal(result.refGroups.length, 1)
  assert.doesNotMatch(result.prompt, /person\/character/)
})

test('mentions of deleted folders are reported once folders have loaded', () => {
  const folders = [{ id: 'kept', name: 'Kept', type: 'location' as const, assets: [{ id: 'k', workspaceAssetId: 'wk', r2_url: '/k.png' }] }]
  const mentions = [
    { folderId: 'kept', name: 'Kept', selectedAssetIds: ['k'] },
    { folderId: 'gone', name: 'Gone', selectedAssetIds: ['g'], selectedWorkspaceAssetIds: ['wg'] },
  ]
  assert.deepEqual(compileMentionsForModel('@Kept @Gone', mentions, folders, model).missingFolders, ['Gone'])
  assert.deepEqual(compileMentionsForModel('@Kept @Gone', mentions, [], model).missingFolders, [])
})

test('Seedance omni numbers images, videos, and audio separately and splits them out', () => {
  const omniModel = getModelById('seedance-2.5')
  const result = compileMentionsForModel(
    'Extend @Clip with @Hero, voice @Voice',
    [
      { folderId: 'clip', name: 'Clip', selectedAssetIds: [] },
      { folderId: 'hero', name: 'Hero', selectedAssetIds: [] },
      { folderId: 'voice', name: 'Voice', selectedAssetIds: [] },
    ],
    [
      { id: 'clip', name: 'Clip', type: 'general', assets: [{ id: 'c1', r2_url: '/canvas/api/r2-image/c1.mp4', type: 'video' }] },
      { id: 'hero', name: 'Hero', type: 'character', assets: [{ id: 'h1', r2_url: '/canvas/api/r2-image/h1.png', type: 'image' }, { id: 'h2', r2_url: '/canvas/api/r2-image/h2.png', type: 'image' }] },
      { id: 'voice', name: 'Voice', type: 'general', assets: [{ id: 'v1', r2_url: '/canvas/api/r2-image/v1.mp3', type: 'audio' }] },
    ],
    omniModel,
  )
  assert.equal(result.strategy, 'citation-media')
  assert.match(result.prompt, /^Extend the exact same subject shown in @Video1,.* with .*@Image1 @Image2,.* voice .*@Audio1,/)
  assert.deepEqual(result.refGroups.map((group) => group.urls), [['/canvas/api/r2-image/h1.png', '/canvas/api/r2-image/h2.png']])
  assert.deepEqual(result.videoUrls, ['/canvas/api/r2-image/c1.mp4'])
  assert.deepEqual(result.audioUrls, ['/canvas/api/r2-image/v1.mp3'])
})

test('Seedance 2.0 omni takes videos; frame models take no references', () => {
  const folders = [{ id: 'clip', name: 'Clip', type: 'general' as const, assets: [{ id: 'c1', r2_url: '/canvas/api/r2-image/c1.mp4', type: 'video' }] }]
  const mentions = [{ folderId: 'clip', name: 'Clip', selectedAssetIds: [] }]
  const older = compileMentionsForModel('Use @Clip', mentions, folders, getModelById('seedance-2.0'))
  assert.match(older.prompt, /@Video1/)
  assert.deepEqual(older.videoUrls, ['/canvas/api/r2-image/c1.mp4'])
  const frameResult = compileMentionsForModel('Use @Clip', mentions, folders, getModelById('seedance-2.5-frame'))
  assert.equal(frameResult.strategy, 'none')
  assert.deepEqual(frameResult.refGroups, [])
})
