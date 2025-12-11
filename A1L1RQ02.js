const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function a1l1q2(id, framework) {
  console.log(id, framework);
  
  // Define base URL based on framework
  let baseURL = '';
  if (id ==='7' && framework === 'react') {
    baseURL = 'http://localhost:5175';
  } else if (id=== '7' && framework === 'vue') {
    baseURL = 'http://localhost:5176';
  } else if (id=== '10' && framework === 'react') {
    baseURL = 'http://localhost:5181';
  } else if (id=== '10' && framework === 'vue') {
    baseURL = 'http://localhost:5182';
  }  else if (id=== '13' && framework === 'react') {
    baseURL = 'http://localhost:5187';
  } else if (id=== '13' && framework === 'vue') {
    baseURL = 'http://localhost:5188';
  }

  else if (id=== '16' && framework === 'react') {
    baseURL = 'http://localhost:5193';
  } else if (id=== '16' && framework === 'vue') {
    baseURL = 'http://localhost:5194';
  } else if (id=== '19' && framework === 'react') {
    baseURL = 'http://localhost:5199';
  } else if (id=== '19' && framework === 'vue') {
    baseURL = 'http://localhost:5200';
  }
  else if (id=== '22' && framework === 'react') {
    baseURL = 'http://localhost:5205';
  }else if (id=== '22' && framework === 'vue') {
    baseURL = 'http://localhost:5206';
  }


  else if (id=== '25' && framework === 'react') {
    baseURL = 'http://localhost:5211';
  }else if (id=== '25' && framework === 'vue') {
    baseURL = 'http://localhost:5212';
  }else if (id=== '28' && framework === 'react') {
    baseURL = 'http://localhost:5217';
  }else if (id=== '28' && framework === 'vue') {
    baseURL = 'http://localhost:5218';
  }else if (id=== '31' && framework === 'react') {
    baseURL = 'http://localhost:5223';
  }else if (id=== '31' && framework === 'vue') {
    baseURL = 'http://localhost:5224';
  }else if (id=== '34' && framework === 'react') {
    baseURL = 'http://localhost:5229';
  }else if (id=== '34' && framework === 'vue') {
    baseURL = 'http://localhost:5230';
  }else if (id=== '37' && framework === 'react') {
    baseURL = 'http://localhost:5235';
  }else if (id=== '37' && framework === 'vue') {
    baseURL = 'http://localhost:5236';
  }else if (id=== '40' && framework === 'react') {
    baseURL = 'http://localhost:5241';
  }else if (id=== '40' && framework === 'vue') {
    baseURL = 'http://localhost:5242';
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL);

  const viewportSizesToTest = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 425, height: 800 },
    { width: 375, height: 667 }
  ];
  
  const concurrentUsers = 2;
  
  // Performance test function
  async function performanceTest() {
    const loadTimes = await Promise.all(
      Array.from({ length: concurrentUsers }).map(async (_, i) => {
        const browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.setViewportSize(viewportSizesToTest[i % viewportSizesToTest.length]);
        const start = Date.now();
        await page.goto(baseURL, { waitUntil: 'networkidle' });
        const end = Date.now();
        await browser.close();
        return end - start;
      })
    );
    
    const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
    let score = 5;
    if (avgLoadTime < 500) score = 20;
    if (avgLoadTime < 1000) score = 18;
    if (avgLoadTime < 1500) score = 15;
    if (avgLoadTime < 2000) score = 10;
    
    return {
      name: 'Concurrent Load Time',
      selector: 'html',
      score,
      Loadtime: avgLoadTime,
      category: 'Performance - Page Load',
      averageLoadTime: avgLoadTime,
      loadTimes
    };
  }

  // Responsiveness test function
  async function responsivenessTest() {
    const viewportResults = [];
    for (const viewport of viewportSizesToTest) {
      const browser = await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      await page.goto(baseURL);
      const isResponsive = await page.evaluate(vp => window.innerWidth >= vp.width, viewport);
      await browser.close();
      viewportResults.push({ viewport, isResponsive });
    }
    
    const passed = viewportResults.filter(r => r.isResponsive).length;
    const total = viewportResults.length;
    const score = Math.round((passed / total) * 20);  // Score out of 20

    return {
      name: 'Viewport Responsiveness',
      selector: 'body',
      score,
      category: 'Responsiveness - Viewport Support',
      results: viewportResults
    };
  }

  // Check HTML structure function
  async function checkHtmlStructure(page) {
    console.log("Checking label structure...");
  
    const result = await page.evaluate(() => {
      const label = document.querySelector('label');
      const debug = {
        labelExists: !!label,
        labelText: '',
        containsText: false
      };
  
      if (label) {
        const text = label.textContent || '';
        debug.labelText = text;
        debug.containsText = text.includes("Designed and Developed by");
      }
  
      return debug;
    });
  
    // Debug output
    console.log("Label Found:", result.labelExists);
    console.log("Label Text:", result.labelText);
    console.log("Contains Required Text:", result.containsText);
  
    // Return true only if label exists and contains the required text
    return result.labelExists && result.containsText;
  }
  const expectedFound = [];
  // CSS property check function
  async function checkCssProperty(page, selector, property, expectedValue) {
    const element = await page.$(selector);
    if (!element) {
      console.log(`❌ Element "${selector}" not found.`);
      return false;
    }
  
    const actualValue = await page.$eval(selector, (el, prop) =>
      getComputedStyle(el)[prop], property);
  
    let isMatch = false;
  
    if (property === 'transform') {
      const match = actualValue.match(/matrix\(([^)]+)\)/);
      if (match) {
        const matrixParts = match[1].split(',').map(x => parseFloat(x.trim()));
        const translateY = matrixParts[5];
        const expectedY = parseFloat(expectedValue.match(/-?\d+/)[0]);
        isMatch = Math.abs(translateY - expectedY) <= 0.5;
      }
    } else if (property === 'font-family' || property === 'fontFamily') {
      const normalizeFonts = (str) =>
        str
          .toLowerCase()
          .replace(/['"]/g, '')
          .split(',')
          .map(f => f.trim());
    
      const actualFonts = normalizeFonts(actualValue);
      const expectedFonts = normalizeFonts(expectedValue);
      const matchesStack = expectedFonts.every(font => actualFonts.includes(font));
      isMatch = matchesStack;
    
      console.log(`🎯 Expected font stack:`, expectedFonts);
      console.log(`🎯 Actual font stack:`, actualFonts);
    } else if (property === 'transition') {
      isMatch = actualValue.trim().startsWith(expectedValue.replace(' ease', '').trim());
    } else {
      isMatch = actualValue.trim() === expectedValue.trim();
    }
    
    console.log(`🧪 ${selector} ${property} → Expected: ${expectedValue}, Found: ${actualValue}`);
     expectedFound.push({ selector: selector, property: property, expectedValue: expectedValue, actualValue: actualValue });
    return isMatch;
  }

  // Color helper functions
  const hexToRgb = hex => {
    if (!hex) throw new Error('hexToRgb: expected a valid hex color but got undefined');
    const bigint = parseInt(hex.replace('#', ''), 16);
    return `rgb(${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255})`;
  };

  function normalizeRgbString(rgbStr) {
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : null;
  }

  const extractRgbOnly = rgbaString => {
    const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : null;
  };
  
  // Check element color function
  async function checkElementColor(page, selector, expectedHexColor) {
    const element = await page.$(selector);
    if (!element) {
      console.log(`❌ Element "${selector}" not found.`);
      return false;
    }
    const actualColor = await page.$eval(selector, el =>
      getComputedStyle(el).backgroundColor
    );
    const expectedColor = hexToRgb(expectedHexColor);
    
    console.log(`🎨 ${selector} → Expected: ${expectedColor}, Found: ${actualColor}`);
    expectedFound.push({ selector: selector, expectedValue: expectedColor, actualValue: expectedColor });
    return actualColor === expectedColor;
  }
  
  // Check hover color function
  async function checkHoverColor(page, selector, expectedHexColor) {
    await page.hover(selector);
    await page.waitForTimeout(500);
    const actualColor = await page.$eval(selector, el =>
      getComputedStyle(el).backgroundColor
    );
  
    const actualRGB = extractRgbOnly(actualColor);
    const expectedRGB = hexToRgb(expectedHexColor);
    console.log(`🎯 Hover ${selector} → Expected: ${expectedRGB}, Found: ${actualRGB}`);
    return actualRGB === expectedRGB;
  }

  // Run the tests
  const responsivenessResult = await responsivenessTest();
  const performanceResult = await performanceTest();

  const classifications = [
    // Essentials
    {
        name: 'Concurrent Load Time',
        selector: 'html',
        score: performanceResult.score || 0,  // from load test
        category: 'Efficiency',
        check: performanceTest
      },
      {
        name: 'Responsiveness',
        selector: 'body',
        score: responsivenessResult.score || 0,  // from viewport checks
        category: 'Efficiency',
        check: responsivenessTest
      },
     {
      name: 'container - background color',
      selector: '.technologies-container',
      property: 'background-color',
      expectedColor: '#f3fbff',
      score: 5,
      category: 'Essential',
      check: checkElementColor,
    },
    {
        name: 'container : padding',
        selector: '.technologies-container',
        property: 'padding',
        expectedValue: '40px 20px',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'padding', expectedValue = '40px 20px') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'sub-text width',
        selector: '.tech-subtext',
        property: 'max-width',
        expectedValue: '700px',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'max-width', expectedValue = '700px') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'sub-text padding',
        selector: '.tech-card',
        property: 'padding',
        expectedValue: '20px',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'padding', expectedValue = '20px') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'sub-text position',
        selector: '.tech-card',
        property: 'position',
        expectedValue: 'relative',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'position', expectedValue = 'relative') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'Image width',
        selector: '.tech-img',
        property: 'width',
        expectedValue: '60px',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'width', expectedValue = '60px') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'Image Height',
        selector: '.tech-img',
        property: 'height',
        expectedValue: '60px',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'height', expectedValue = '60px') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'Image Display',
        selector: '.tech-img',
        property: 'display',
        expectedValue: 'block',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'display', expectedValue = 'block') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'Page Layout with Grid',
        selector: '.tech-grid',
        property: 'display',
        expectedValue: 'grid',
        score: 5,
        category: 'Essential',
        check: (page, selector, _, property = 'display', expectedValue = 'grid') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'CSS Style - Smoothness & Performance',
        selector: '.tech-grid',
        property: 'gap',
        expectedValue: '70px',
        score: 5,
        category: 'Required',
        check: (page, selector, _, property = 'gap', expectedValue = '70px') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
      {
        name: 'Aesthetics Elements',
        selector: '.tech-grid',
        property: 'justify-content',
        expectedValue: 'center',
        score: 5,
        category: 'Required',
        check: (page, selector, _, property = 'justify-content', expectedValue = 'center') =>
                checkCssProperty(page, selector, property, expectedValue),
      },
    {
      name: 'HTML Semantics - Basic Structure - HTML Structure Validation',
      selector: 'html',
      score: 5,
      category: 'Required',
      check: checkHtmlStructure
    },
    {
      name: 'CSS - Structure of a Page - Border Radius',
      selector: '.tech-card',
      property: 'border-radius',
      expectedValue: '12px',
      score: 5,
      category: 'Required',
      check: (page, selector, _, property = 'border-radius', expectedValue = '12px') =>
        checkCssProperty(page, selector, property, expectedValue),
    },
    // {
    //   name: 'Aesthetics Elements - Box Shadow',
    //   selector: '.tech-card',
    //   property: 'box-shadow',
    //   expectedValue: '0 4px 15px rgba(0, 0, 0, 0.08)',
    //   score: 5,
    //   category: 'Required',
    //   check: async (page, selector, _, property = 'box-shadow', expectedValue = '0 4px 15px rgba(0, 0, 0, 0.08)') => {
    //     await page.waitForSelector(selector); // Wait for the element to appear
    //     return checkCssProperty(page, selector, property, expectedValue);}
    // },
    // {
    //   name: 'CSS Style - Smoothness & Performance',
    //   selector: '.product-card.tech-card:hover',
    //   property: 'transform',
    //   expectedValue: 'translateY(-5px)',
    //   score: 5,
    //   category: 'Required',
    //   check: async (page, selector, _, property = 'transform', expectedValue = 'translateY(-5px)') => {
    //     await page.hover(selector);
    //     await page.waitForTimeout(500);
    //     return checkCssProperty(page, selector, property, expectedValue);
    //   }
    // },
  ];

  const scoreByCategory = {};
  const maxScoreByCategory = {}; // To keep track of max score for each category
  const detailedResults = [];

  for (const rule of classifications) {
    
    const result = await rule.check(page, rule.selector, rule.expectedColor || rule.expectedValue);
    if (!scoreByCategory[rule.category]) {
      scoreByCategory[rule.category] = 0;
      maxScoreByCategory[rule.category] = 0; // Initialize max score for category
    }

    // Add the rule score to the total and the max score to the max score for the category
    maxScoreByCategory[rule.category] += rule.score;

     // Find the corresponding entry in expectedFound for CSS property checks
  const logEntry = expectedFound.find(
    (entry) =>
      entry.selector === rule.selector &&
      entry.property === rule.property &&
      entry.expectedValue === rule.expectedValue
  );

    if (result) {
      console.log(`✅ Passed: ${rule.name} (+${rule.score})`);
      scoreByCategory[rule.category] += rule.score;
      detailedResults.push({
        category: rule.category,
        name: rule.name,
        score: rule.score,
        ReviewDetails: {
          selector: rule.selector,
          property: rule.property,
          expectedValue: logEntry?.expectedValue,
          actualValue: logEntry ? logEntry.actualValue : null // Use the actual value from expectedFound
        }
      });
    } else {
      console.log(`❌ Failed: ${rule.name}`);
      detailedResults.push({
        category: rule.category,
        name: rule.name,
        score: 0,
        ReviewDetails: {
          selector: rule.selector,
          property: rule.property,
          expectedValue: logEntry?.expectedValue,
          actualValue: logEntry ? logEntry.actualValue : null // Use the actual value from expectedFound
        }
      });
    }
  }

  const finalReport = {
    AvgLoadTime: performanceResult.averageLoadTime, // included inside JSON file
    EvaluationDetails: detailedResults
  };

  console.log(`\n⏱️ Average Load Time: ${performanceResult.averageLoadTime} ms`);

  await browser.close();
  return {
    AvgLoadTime: performanceResult.averageLoadTime, 
    EvaluationDetails: detailedResults
  };
}

module.exports = { a1l1q2 };