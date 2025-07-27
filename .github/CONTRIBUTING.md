# Contributing

## Request for Changes / Pull Requests

clone the project first

```sh
git clone https://github.com/bastiangx/wordserve-obsidian.git
cd wordserve-obsidian
```

Add git remote controls :

```sh
# Using HTTPS
git remote add fork https://github.com/YOUR-USERNAME/wordserve-obsidian.git
git remote add upstream https://github.com/bastiangx/wordserve-obsidian.git

# Using SSH
git remote add fork git@github.com:YOUR-USERNAME/wordserve-obsidian.git
git remote add upstream git@github.com:bastiangx/wordserve-obsidian.git
```

You can now verify that you have your two git remotes:

```sh
git remote -v
```

## Receive remote updates

In view of staying up to date with the central repository :

```sh
git pull upstream main
```

## Choose a base branch

Before starting development, you need to know which branch to base your
modifications/additions on. When in doubt, use main.

| Type of change                |           | Branches              |
| :------------------           |:---------:| ---------------------:|
| Documentation                 |           | `main`              |
| Bug fixes                     |           | `main`              |
| New features                  |           | `main`              |
| New issues models             |           | `YOUR-USERNAME-patch` |

```sh
# Switch to the desired branch
git switch main

# Pull down any upstream changes
git pull

# Create a new branch to work on
git switch --create patch/1234-name-issue
```

Commit your changes, then push the branch to your fork
with `git push -u fork` and open a pull request on
[the WordServe Obsidian repository](https://github.com/bastiangx/wordserve-obsidian/)