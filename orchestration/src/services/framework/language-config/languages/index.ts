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
import { c } from './c.js';
import { clojure } from './clojure.js';
import { cpp } from './cpp.js';
import { crystal } from './crystal.js';
import { csharp } from './csharp.js';
import { css } from './css.js';
import { dart } from './dart.js';
import { elixir } from './elixir.js';
import { erlang } from './erlang.js';
import { fsharp } from './fsharp.js';
import { gleam } from './gleam.js';
import { go } from './go.js';
import { haskell } from './haskell.js';
import { html } from './html.js';
import { java } from './java.js';
import { javascript } from './javascript.js';
import { julia } from './julia.js';
import { kotlin } from './kotlin.js';
import { lua } from './lua.js';
import { nim } from './nim.js';
import { objectivec } from './objectivec.js';
import { ocaml } from './ocaml.js';
import { perl } from './perl.js';
import { php } from './php.js';
import { powershell } from './powershell.js';
import { python } from './python.js';
import { r } from './r.js';
import { ruby } from './ruby.js';
import { rust } from './rust.js';
import { scala } from './scala.js';
import { shell } from './shell.js';
import { sql } from './sql.js';
import { swift } from './swift.js';
import { typescript } from './typescript.js';
import { vbnet } from './vbnet.js';
import { zig } from './zig.js';

export const ALL_LANGUAGE_CONFIGS: ReadonlyArray<LanguageConfig> = [
  c,
  clojure,
  cpp,
  crystal,
  csharp,
  css,
  dart,
  elixir,
  erlang,
  fsharp,
  gleam,
  go,
  haskell,
  html,
  java,
  javascript,
  julia,
  kotlin,
  lua,
  nim,
  objectivec,
  ocaml,
  perl,
  php,
  powershell,
  python,
  r,
  ruby,
  rust,
  scala,
  shell,
  sql,
  swift,
  typescript,
  vbnet,
  zig,
];
