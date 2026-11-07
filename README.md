# Jonathan Doane's research portfolio

A responsive, single-page portfolio for Jonathan D. Doane, Ph.D., featuring quantitative research, statistical modeling, applied machine learning, and responsible AI projects.

## Curriculum & Instruction portfolio

The companion [Curriculum & Instruction leadership portfolio](https://jonathandoanephd.github.io/research-portfolio/curriculum-leadership/) presents Jonathan's work in learning sciences, framework stewardship, instructional quality, state-standards alignment and applied educational AI. It includes a table grouping named educational theories by application area, an illustrative state-by-state standards reference, and links to public research projects.

- Page source: [site/curriculum-leadership/index.html](site/curriculum-leadership/index.html)
- Navigation: the main research portfolio links to this page, and the curriculum page links back to the research portfolio.
- Branding: the existing fox art and light blue/navy visual identity are reused, including a matching fox favicon.

The public content is intentionally high-level. It does not publish private student information or proprietary curriculum operating materials.

## View locally

No build tools are required. Open `site/index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000 --directory site
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

This repository includes `.github/workflows/pages.yml`. In the GitHub repository's **Settings → Pages**, set the build and deployment source to **GitHub Actions**. Push to `main` to deploy the `site/` folder. The site uses relative asset paths, so it works at a project URL such as `https://jonathandoanephd.github.io/research-portfolio/`.

## Structure

- `site/index.html`: main research portfolio, including a link to curriculum leadership
- `site/curriculum-leadership/index.html`: curriculum and instructional leadership portfolio
- `site/assets/`: transparent fox artwork
- `.github/workflows/pages.yml`: Pages deployment

The animated icosahedron is generated in JavaScript from vertices and edges. Pointer motion near it gently changes its rotation. The animation respects reduced-motion preferences.

## Content and artwork

Project summaries distinguish retrospective modeling results from deployed systems. The fox artwork was generated for this portfolio and should not be redistributed as a standalone asset without Jonathan's permission. See [LICENSE](LICENSE) for the source-code license and artwork exception.

## Contact

[LinkedIn](https://www.linkedin.com/in/jonathandoanephd/) · [Email](mailto:JonathanDoanePhD@gmail.com)
