import type { LanguageConfig } from '../types.js';
import { regexFirstGroup } from '../extractors.js';

export const swift: LanguageConfig = {
  key: 'swift',
  displayName: 'Swift',
  extensions: ['swift'],
  manifests: [
    { kind: 'Package.swift', format: 'text', manager: 'swift-pm' },
    { kind: '*.xcodeproj', format: 'text', manager: 'xcode' },
    { kind: '*.xcworkspace', format: 'text', manager: 'xcode' },
    { kind: 'Info.plist', format: 'xml', manager: 'xcode' },
    { kind: 'Podfile', format: 'text', manager: 'cocoapods' },
  ],
  lockFiles: [],
  defaultManager: 'swift-pm',
  runtimeVersionFiles: [
    {
      key: 'swift',
      filename: 'Package.swift',
      extract: regexFirstGroup(/swift-tools-version:\s*([\d.]+)/),
    },
  ],
  toolTokens: {
    linters: ['swiftlint'],
    formatters: ['swift-format', 'swiftformat'],
    typeCheckers: ['swift'],
    testRunners: ['xctest', 'quick', 'nimble'],
    commonFrameworks: ['vapor', 'kitura', 'perfect', 'hummingbird'],
  },
  commandDefaults: {
    lint: 'swiftlint lint',
    format: 'swiftformat .',
    typecheck: "xcodebuild build -destination 'platform=iOS Simulator,name=iPhone 16'",
    test: "xcodebuild test -destination 'platform=iOS Simulator,name=iPhone 16'",
    build: "xcodebuild build -destination 'platform=iOS Simulator,name=iPhone 16'",
  },
  hasImplementerAgent: true,
};
