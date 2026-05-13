/**
 * Language registry.
 *
 * Adding a new language: create `languages/<key>.ts` exporting a
 * `LanguageConfig` and add ONE import + entry line here. Tests in
 * `test/unit/services/framework/language-config/` enforce that the
 * registry is consistent (no duplicate keys, no empty extensions,
 * `extends` references resolve, manifest formats are valid).
 */

import type { LanguageConfig } from '../types.js';
import { crystal } from './crystal.js';
import { dart } from './dart.js';
import { dotnet } from './dotnet.js';
import { elixir } from './elixir.js';
import { erlang } from './erlang.js';
import { gleam } from './gleam.js';
import { go } from './go.js';
import { haskell } from './haskell.js';
import { java } from './java.js';
import { javascript } from './javascript.js';
import { kotlin } from './kotlin.js';
import { nim } from './nim.js';
import { ocaml } from './ocaml.js';
import { php } from './php.js';
import { python } from './python.js';
import { ruby } from './ruby.js';
import { rust } from './rust.js';
import { scala } from './scala.js';
import { swift } from './swift.js';
import { typescript } from './typescript.js';
import { zig } from './zig.js';

export const ALL_LANGUAGE_CONFIGS: ReadonlyArray<LanguageConfig> = [
  crystal,
  dart,
  dotnet,
  elixir,
  erlang,
  gleam,
  go,
  haskell,
  java,
  javascript,
  kotlin,
  nim,
  ocaml,
  php,
  python,
  ruby,
  rust,
  scala,
  swift,
  typescript,
  zig,
];
