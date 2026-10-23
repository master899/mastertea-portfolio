# mastertea-portfolio

## Portfolio deployment

This is a static portfolio with Netlify Functions and Netlify Blobs for public project uploads.

## Deploy to Netlify

1. Push the contents of this folder to a GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project** and connect the repository.
3. Set the publish directory to `.` if Netlify does not pick it up from `netlify.toml`.
4. In the Netlify site settings, add an environment variable named `PORTFOLIO_ADMIN_TOKEN`, scoped to Functions. Give it a long, random value and keep it private.
5. Trigger a new deploy after setting the variable.
6. Open the published URL with `?manage=1` and enter the same token in **Netlify upload access**.
7. To add screenshots to one of the three projects already on the portfolio, use its **Upload screenshots** button. Each selection uploads immediately and adds to that project's public gallery.
8. To create another project, use **Add a project**, select up to five screenshots, and submit the form.

Project details and screenshots uploaded through the manager are stored in Netlify Blobs and are public to visitors. Use PNG, JPEG, WebP, or GIF screenshots; each image must be 600 KB or smaller, each upload can total no more than 2.5 MB, and each project supports up to five screenshots. Once an existing project has five screenshots, its upload control is removed.

The upload token is kept in the current browser tab's session storage. Do not share it. If it is exposed, replace `PORTFOLIO_ADMIN_TOKEN` in Netlify and redeploy.

Skills, awards, and certificates added through the current manager remain in local browser storage; they are not published by this upload service.

Screenshots selected using the previous local-preview version of the manager were never uploaded and cannot be transferred from that preview. After deploying this Netlify version and configuring the token, add those projects and screenshots again through the manager to publish them.
