#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const releaseVersion = process.env.RELEASE_VERSION ?? "unreleased";
const toRef = process.env.RELEASE_NOTES_TO ?? "HEAD";
const fromRef = resolveFromRef(toRef);
const commits = readCommits(fromRef, toRef);

const sections = new Map([
	["features", []],
	["fixes", []],
	["docs", []],
	["refactors", []],
	["performance", []],
	["build", []],
	["ci", []],
	["tests", []],
	["chore", []],
	["other", []],
]);

for (const commit of commits) {
	const section = classifyCommit(commit.subject);
	const label = `${commit.subject} (${commit.hash.slice(0, 7)})`;
	sections.get(section)?.push(label);
}

const output = [
	`# Release ${releaseVersion}`,
	"",
	`Generated from commits in \`${fromRef}..${toRef}\`.`,
	"",
];

const renderedSections = [
	["features", "Features"],
	["fixes", "Fixes"],
	["docs", "Documentation"],
	["refactors", "Refactors"],
	["performance", "Performance"],
	["build", "Build"],
	["ci", "CI"],
	["tests", "Tests"],
	["chore", "Chores"],
	["other", "Other"],
];

for (const [key, title] of renderedSections) {
	const items = sections.get(key) ?? [];

	if (!items.length) {
		continue;
	}

	output.push(`## ${title}`);
	for (const item of items) {
		output.push(`- ${item}`);
	}
	output.push("");
}

if (output.at(-1) === "") {
	output.pop();
}

if (commits.length === 0) {
	output.push("No commits found for this release.");
}

process.stdout.write(output.join("\n"));

function resolveFromRef(targetRef) {
	if (process.env.RELEASE_NOTES_FROM) {
		return process.env.RELEASE_NOTES_FROM;
	}

	const latestTag = git([
		"tag",
		"--list",
		"v*",
		"--sort=-version:refname",
	]).split("\n")[0]?.trim();

	if (latestTag) {
		return latestTag;
	}

	return git(["rev-list", "--max-parents=0", targetRef]);
}

function readCommits(from, to) {
	const raw = git([
		"log",
		"--reverse",
		"--format=%H%x1f%s%x1f%b%x1e",
		`${from}..${to}`,
	]);

	if (!raw) {
		return [];
	}

	return raw
		.split("\x1e")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [hash, subject, body = ""] = entry.split("\x1f");

			return {
				hash,
				subject,
				body,
			};
		})
		.filter((commit) => commit.subject && !isMergeCommit(commit.subject));
}

function classifyCommit(subject) {
	const match = subject.match(
		/^(?<type>[a-z]+)(?:\([^)]+\))?(?:!)?: (?<message>.+)$/i,
	);

	if (!match?.groups?.type) {
		return "other";
	}

	switch (match.groups.type.toLowerCase()) {
		case "feat":
			return "features";
		case "fix":
			return "fixes";
		case "docs":
			return "docs";
		case "refactor":
			return "refactors";
		case "perf":
			return "performance";
		case "build":
			return "build";
		case "ci":
			return "ci";
		case "test":
			return "tests";
		case "chore":
			return "chore";
		default:
			return "other";
	}
}

function isMergeCommit(subject) {
	return subject.startsWith("Merge ") || subject.startsWith("Revert ");
}

function git(args) {
	return execFileSync("git", args, {
		encoding: "utf8",
	}).trim();
}
