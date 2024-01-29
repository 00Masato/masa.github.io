import { program } from "commander";
import * as fs from "node:fs";

program
  .option('-f, --file-name <file>', 'create file name.')
  .option('-t, --title <title>')
  .option('-s, --slug <slug>')
  .option('-d, --description <description>');

program.parse(process.argv);

const options = program.opts();
const directory = "src/content/blog/";
const extension = ".md";
const date = new Date();
const localISOTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, -1);
const title = options.title;
const slug = options.slug;
const description = options.description;

const header = `---
author: 00Masato
pubDatetime: ${localISOTime}
title: ${title}
slug: ${slug}
featured: false
description: ${description}
---`;
try {
  fs.writeFileSync(directory + options.fileName + extension, header);
} catch (e) {
  console.log(e);
}

