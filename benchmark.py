import asyncio
from playwright.async_api import async_playwright
import time
import subprocess
import os

async def main():
    # Start a simple HTTP server in the background
    server_process = subprocess.Popen(["python3", "-m", "http.server", "8000"])

    # Wait for the server to start
    await asyncio.sleep(2)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to the page
        await page.goto("http://localhost:8000/index.html")

        # Wait for any initial rendering to complete
        await page.wait_for_selector("#dynamic-zones")

        # Inject our benchmark script to measure renderCategorizedNodes
        results = await page.evaluate("""
            async () => {
                // Wait a bit for global variables to be populated if needed
                await new Promise(r => setTimeout(r, 500));

                // Generate a lot of nodes to make the performance difference obvious
                const testNodes = [];
                const numCategories = 100;
                const nodesPerCategory = 10;

                for (let i = 0; i < numCategories; i++) {
                    const category = `Category ${i}`;
                    // ensure globalCategories knows about it
                    if (typeof globalCategories !== 'undefined') {
                        globalCategories.push({name: category});
                    }
                    for (let j = 0; j < nodesPerCategory; j++) {
                        testNodes.push({
                            id: i * nodesPerCategory + j,
                            category: category,
                            title: `Node ${i}-${j}`,
                            url: `http://example.com/${i}/${j}`,
                            description: 'Test description'
                        });
                    }
                }

                const iterations = 50;
                let totalTime = 0;

                for (let i = 0; i < iterations; i++) {
                    const start = performance.now();
                    // Call the function we want to benchmark
                    renderCategorizedNodes(testNodes);
                    const end = performance.now();
                    totalTime += (end - start);
                }

                return {
                    average: totalTime / iterations,
                    total: totalTime
                };
            }
        """)

        print(f"Benchmark Results:")
        print(f"Average time per render: {results['average']:.2f} ms")
        print(f"Total time for 50 renders: {results['total']:.2f} ms")

        await browser.close()

    # Terminate the server
    server_process.terminate()

asyncio.run(main())
