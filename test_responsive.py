from playwright.sync_api import sync_playwright
import time

def test_responsive():
    with sync_playwright() as p:
        # Launch Chromium
        browser = p.chromium.launch(headless=True)
        
        # Test Mobile View
        mobile_context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        )
        mobile_page = mobile_context.new_page()
        
        print("Testing mobile view (390x844)...")
        mobile_page.goto('http://localhost:4173')
        mobile_page.wait_for_load_state('networkidle')
        
        # Verify hamburger menu exists on mobile instead of full sidebar
        hamburger = mobile_page.locator('button.md\\:hidden')
        if hamburger.is_visible():
            print("✓ Mobile view: Hamburger menu visible.")
        else:
            print("✗ Mobile view: Hamburger menu not found!")
            
        # Test Desktop View
        desktop_context = browser.new_context(
            viewport={'width': 1280, 'height': 720}
        )
        desktop_page = desktop_context.new_page()
        
        print("Testing desktop view (1280x720)...")
        desktop_page.goto('http://localhost:4173')
        desktop_page.wait_for_load_state('networkidle')
        
        # Verify sidebar is visible and hamburger is hidden on desktop
        desktop_hamburger = desktop_page.locator('button.md\\:hidden')
        if not desktop_hamburger.is_visible():
            print("✓ Desktop view: Hamburger menu correctly hidden.")
        else:
            print("✗ Desktop view: Hamburger menu incorrectly visible!")
            
        # Select sidebar elements by checking for specific sidebar classes
        sidebar_container = desktop_page.locator('div.md\\:relative.md\\:translate-x-0')
        if sidebar_container.is_visible():
            print("✓ Desktop view: Full sidebar visible.")
        else:
            print("✗ Desktop view: Full sidebar not visible!")
        
        browser.close()

if __name__ == "__main__":
    test_responsive()
