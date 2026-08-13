import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, '..')
const outputDir = resolve(root, 'dist')

const routes = [
  {
    route: '/',
    entryFile: resolve(outputDir, 'index.html'),
    expectedLinks: ['./eip-4337/', './eip-7702/'],
  },
  {
    route: '/eip-4337/',
    entryFile: resolve(outputDir, 'eip-4337/index.html'),
    expectsAppShell: true,
  },
  {
    route: '/eip-7702/',
    entryFile: resolve(outputDir, 'eip-7702/index.html'),
    expectsAppShell: true,
  },
]

const failures = []
const results = []

await checkOutputDirectory()

for (const route of routes) {
  await checkRoute(route)
}

if (failures.length > 0) {
  console.error(`Pages smoke check failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  console.error('\nRun "pnpm build" before retrying this check.')
  process.exitCode = 1
} else {
  console.log('Pages smoke check passed:')
  for (const result of results) {
    console.log(`  - ${result}`)
  }
}

async function checkOutputDirectory() {
  try {
    const outputStat = await stat(outputDir)
    if (!outputStat.isDirectory()) {
      failures.push(`Build output is not a directory: ${displayPath(outputDir)}`)
    }
  } catch (error) {
    failures.push(
      `Build output is missing or unreadable: ${displayPath(outputDir)} (${error.message})`,
    )
  }
}

async function checkRoute({ route, entryFile, expectedLinks = [], expectsAppShell = false }) {
  let html

  try {
    const entryStat = await stat(entryFile)
    if (!entryStat.isFile()) {
      failures.push(`${route} entry is not a file: ${displayPath(entryFile)}`)
      return
    }
    html = await readFile(entryFile, 'utf8')
  } catch (error) {
    failures.push(`${route} entry is missing or unreadable: ${displayPath(entryFile)} (${error.message})`)
    return
  }

  const anchorLinks = extractTags(html, 'a')
    .map((tag) => getAttribute(tag, 'href'))
    .filter(Boolean)

  for (const expectedLink of expectedLinks) {
    if (!anchorLinks.includes(expectedLink)) {
      failures.push(`${route} entry does not link to ${expectedLink}`)
    }
  }

  if (expectsAppShell) {
    checkAppShell(route, html)
  }

  const references = extractLocalReferences(html)
  for (const reference of references) {
    await checkLocalReference(route, entryFile, reference)
  }

  results.push(
    `${route} -> ${displayPath(entryFile)} (${references.length} local static reference(s))`,
  )
}

function checkAppShell(route, html) {
  if (!/<div\b[^>]*\bid\s*=\s*(["'])root\1[^>]*>/i.test(html)) {
    failures.push(`${route} entry is missing the React mount element #root`)
  }

  const hasModuleEntry = extractTags(html, 'script').some(
    (tag) => getAttribute(tag, 'type') === 'module' && Boolean(getAttribute(tag, 'src')),
  )
  if (!hasModuleEntry) {
    failures.push(`${route} entry is missing a module script with a src reference`)
  }

  const hasStylesheet = extractTags(html, 'link').some((tag) => {
    const rel = getAttribute(tag, 'rel')
    return rel?.toLowerCase().split(/\s+/).includes('stylesheet') && Boolean(getAttribute(tag, 'href'))
  })
  if (!hasStylesheet) {
    failures.push(`${route} entry is missing a stylesheet link`)
  }
}

function extractLocalReferences(html) {
  const references = new Set()
  const tags = ['a', 'img', 'link', 'script', 'source'].flatMap((tagName) =>
    extractTags(html, tagName),
  )

  for (const tag of tags) {
    for (const attributeName of ['href', 'src']) {
      const reference = getAttribute(tag, attributeName)
      if (reference && !isExternalReference(reference)) {
        references.add(reference)
      }
    }
  }

  return [...references]
}

async function checkLocalReference(route, entryFile, reference) {
  if (reference.startsWith('/')) {
    failures.push(
      `${route} uses root-absolute reference ${JSON.stringify(reference)}; Pages assets and routes must be relative`,
    )
    return
  }

  const referencePath = reference.split(/[?#]/, 1)[0]
  let decodedPath
  try {
    decodedPath = decodeURIComponent(referencePath)
  } catch (error) {
    failures.push(`${route} has an invalid URL reference ${JSON.stringify(reference)} (${error.message})`)
    return
  }

  const resolvedPath = resolve(dirname(entryFile), decodedPath)
  const targetPath = decodedPath.endsWith('/') ? join(resolvedPath, 'index.html') : resolvedPath
  const outputRelativePath = relative(outputDir, targetPath)

  if (
    outputRelativePath === '..' ||
    outputRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(outputRelativePath)
  ) {
    failures.push(`${route} reference escapes dist/: ${JSON.stringify(reference)}`)
    return
  }

  try {
    const targetStat = await stat(targetPath)
    if (!targetStat.isFile()) {
      failures.push(
        `${route} reference is not a file: ${JSON.stringify(reference)} -> ${displayPath(targetPath)}`,
      )
    }
  } catch (error) {
    failures.push(
      `${route} reference is missing or unreadable: ${JSON.stringify(reference)} -> ${displayPath(targetPath)} (${error.message})`,
    )
  }
}

function extractTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map((match) => match[0])
}

function getAttribute(tag, attributeName) {
  const match = tag.match(
    new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'),
  )
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function isExternalReference(reference) {
  return (
    reference.startsWith('#') ||
    reference.startsWith('?') ||
    reference.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(reference)
  )
}

function displayPath(path) {
  return relative(root, path) || '.'
}
