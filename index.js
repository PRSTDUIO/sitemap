const axios = require('axios');
const { parseString } = require('xml2js');
const cheerio = require('cheerio');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

async function fetchSitemap(url) {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching sitemap:', error);
        return null;
    }
}

function parseSitemap(xml) {
    return new Promise((resolve, reject) => {
        parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

async function extractUrlsFromSitemap(sitemapUrl) {
    const sitemapXml = await fetchSitemap(sitemapUrl);
    if (!sitemapXml) return [];

    const sitemap = await parseSitemap(sitemapXml);
    if (!sitemap || !sitemap.urlset || !sitemap.urlset.url) return [];

    return sitemap.urlset.url.map(url => url.loc[0]);
}

async function extractUrlsFromSitemapIndex(sitemapIndexUrl) {
    const sitemapIndexXml = await fetchSitemap(sitemapIndexUrl);
    if (!sitemapIndexXml) return [];

    const sitemapIndex = await parseSitemap(sitemapIndexXml);
    if (!sitemapIndex || !sitemapIndex.sitemapindex || !sitemapIndex.sitemapindex.sitemap) return [];

    const subSitemapUrls = sitemapIndex.sitemapindex.sitemap.map(sitemap => sitemap.loc[0]);
    const urls = [];
    for (const subSitemapUrl of subSitemapUrls) {
        const subUrls = await extractUrlsFromSitemap(subSitemapUrl);
        urls.push(...subUrls);
    }
    return urls;
}

async function fetchAndExtractMetaTags(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const title = $('title').text();
        const description = $('meta[name="description"]').attr('content');
        return {
            url,
            title,
            description
        };
    } catch (error) {
        console.error(`Error fetching ${url}:, error`);
        return { url, title: null, description: null };
    }
}

app.post('/fetch-meta-tags', async (req, res) => {
    const sitemapIndexUrl = req.body.sitemapIndexUrl;
    if (!sitemapIndexUrl) {
        return res.status(400).json({ error: 'Sitemap index URL is required' });
    }

    try {
        const urls = await extractUrlsFromSitemapIndex(sitemapIndexUrl);
        const metaTagsPromises = urls.map(fetchAndExtractMetaTags);
        const metaTags = await Promise.all(metaTagsPromises);
        res.json(metaTags);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});