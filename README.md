<h1 align="center">
  <a href="https://github.com/bastiangx/wordserve-obsidian">
 <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://files.catbox.moe/89vvzu.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://files.catbox.moe/5gb4ye.png">
      <img src="https://files.catbox.moe/5gb4ye.png"/>
    </picture>
  </a>
</h1>

<div align="center">
Lightweight Autosuggestions and abbrevations for Obsidian!

<br />
<br />

<div align="center">
    <picture>
      <source srcset="https://github.com/user-attachments/assets/0da6f300-0711-4f85-85c4-6a19c22a7f75" />
      <img src="https://github.com/user-attachments/assets/0da6f300-0711-4f85-85c4-6a19c22a7f75" alt="Example usage of wordserve suggestions engine in a client app" />
    </picture>
</div>

<br />
<a href="https://pkg.go.dev/github.com/bastiangx/wordserve"><img src="https://img.shields.io/badge/reference-black?style=for-the-badge&logo=go&logoSize=auto&labelColor=%23363A4F&color=%237dc4e4" alt="Go Reference"></a> <a href="https://goreportcard.com/report/github.com/bastiangx/wordserve"><img src="https://img.shields.io/badge/A%2B-black?style=for-the-badge&logoSize=auto&label=go%20report&labelColor=%23363A4F&color=%23a6da95" alt="Go Report Card"></a>
<br />
<a href="https://github.com/bastiangx/wordserve/releases/latest"><img src="https://img.shields.io/github/v/release/bastiangx/wordserve?sort=semver&display_name=tag&style=for-the-badge&labelColor=%23363A4F&color=%23f5a97f" alt="Latest Release"></a> <a href="https://github.com/bastiangx/wordserve/blob/main/LICENSE"><img src="https://img.shields.io/badge/MIT-black?style=for-the-badge&label=license&labelColor=%23363A4F&color=%23b7bdf8" alt="MIT License"></a>
<br />

  <a href="https://github.com/bastiangx/wordserve-obsidian/issues/new?assignees=&labels=bug&template=BUG-REPORT.yml&title=%5BBug%5D%3A+">Report a Bug</a>
  ·
  <a href="https://github.com/bastiangx/wordserve-obsidian/issues/new?assignees=&labels=enhancement&template=FEATURE-REQUEST.yml&title=%5BFeature%5D%3A+">Request a Feature</a>
</div>

#### What's it about?

<table>
<tr>
<td>

WordServe is a minimalistic and high performance **Autocompletion plugin** written in Go.
It suggests top ranking words when typing and exapnsions on abbreviations! simple.
You can insert them by pressing `Tab` or `Enter` (or pressing the digit keys for vim users ;) )

#### Why?

So many desktop tools and apps I use on daily basis do not offer any form of word completion, AI/NLP driven or otherwise, there are times when I need to quickly find a word or phrase that I know exists in my vocabulary, but I don't feel like typing for _that_ long.

#### Similar to?

Think of this as a basic nvim-cmp or vscode Intellisense daemon.
Suggestions menu appear when typing any words + Expansions on text via abbreviations, defined and customisable by you.

> I quite frankly made this for myself so I can have a USABLE completion plugin for [Obsidian](https://obsidian.md) but hey, you might find it handy too!
> its still missing some big features like having auto correction and spelling, might add them if people find this actually useful.

</td>
</tr>
</table>

---

## Features

### Batched Word Suggestions

 <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://files.catbox.moe/sd3ikj.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://files.catbox.moe/h26n6q.png">
      <img src="https://files.catbox.moe/h26n6q.png"/>
    </picture>
<br />

WordServe returns suggestions in batches using a radix trie

<br />

### Adaptive theme

### Custom abbrevation expansions

### Digit selection

### Responsive

 <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://files.catbox.moe/ca82mt.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://files.catbox.moe/8emcdr.png">
      <img src="https://files.catbox.moe/8emcdr.png"/>
    </picture>
<br />
<br />

### Many many words

 <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://files.catbox.moe/z463kh.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://files.catbox.moe/w4cn0v.png">
      <img src="https://files.catbox.moe/w4cn0v.png"/>
    </picture>

<br />

Start with a simple `words.txt` file containing 65,000+ entries.

WordServe chunks the dictionary into binary trie files and loads only what's needed, dynamically managing memory based on usage patterns.

---

## Installation

### Obsidian

Open the _Community plugins_ tab, browse and search for `WordServe`

#### Building and development

```sh
git clone https://github.com/bastiangx/wordserve-obsidian.git
cd wordserve-obsidian
bun i
bun run dev
```

place cloned folder inside Obsidina's plugins directory, Obsidian should load it autmatically by clicking the community plugin's refersh button

```
~/username/Documents/Vault/.obsidian/plugins/
```

> The initial build for dictionary files are handled by the `wordserve` binary itself, If you encounter any issues, refer to the [Go library](https://github.com/bastiangx/wordserve)

> Make sure the `data/` directory exists and has the `words.txt` file in it.

> [!important]
> This repo is powered by WordServe's own [Go library](https://github.com/bastiangx/wordserve)! check it out if you want to see how the prefixes are actually processed

### DISCLAIMERS

1. The core components **ARE DOWNLOADED FROM GITHUB** via the release versions noted, if plugin version is for example `v0.1.2`, it will only download the `v0.1.2` binaries from [WordServe' repo](https://github.com/bastiangx/wordserve) -- (no mechanisms of auto updating)
   - These binaries include the `wordserve` Go executable, a `words.txt` file and the dictionary files needed for this to work.
   - all fetching impls are done in [downloader.ts file](./src/core/downloader.ts)
   - If you have any issues with the fetching, you can manually get them from the [releases page](https://github.com/bastiangx/wordserve/releases/latest)

2. WordServe does not track any usage data, analytics, telemetry or provide any internal methods of tracking activities to external connections.
   - The `words.txt` file is a simple text file containing a list of words, phrases and abbreviations.
   - precompiled dictionary files are generated from the `words.txt` file and are used to provide autosuggestions.

## Contributing

See the [open issues](https://github.com/bastiangx/wordserve-obsidian/issues) for a list of proposed features (and known issues).

Any PRs are welcome! Refer to the [guidelines](.github/CONTRIBUTING.md)

## License

WordServe is licensed under the **MIT license**.
Feel free to edit and distribute as you like.

See [LICENSE](LICENSE)

## Acknowledgements

- Inspired _heavily_ by [fluent-typer extension](https://github.com/bartekplus/FluentTyper) made by Bartosz Tomczyk.
  - <span style="color: #908caa;">  Its a great extension to use on browsers, but I wanted something that can be used basically in any electron/local webapps with plugin clients, but also make it wayyy faster and more efficient since the depeendencies used there are way too bloated (C++ ...) and had too many bindings for my liking, and also more imporatantly, make this a good practice for me to learn how radix tries work for prefixes.</span>

- The _Beautiful_ [Rosepine theme](https://rosepinetheme.com/) used for graphics and screenshots throughout the readme.
- The Incredible mono font, Berkeley Mono by [U.S. Graphics](https://usgraphics.com/products/berkeley-mono) used in screenshots, graphics, gifs and more.
