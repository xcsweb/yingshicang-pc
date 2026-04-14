import time
import re
import os
from playwright.sync_api import sync_playwright

def test_full_flow():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        # Create a context with desktop viewport
        context = browser.new_context(
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()

        print("Starting full flow test on Desktop (1280x720)...")

        # 1. Navigate to App
        base_url = os.environ.get('BASE_URL', 'http://localhost:4173/')
        page.goto(base_url)
        page.wait_for_load_state('domcontentloaded')
        
        # Wait a bit for React to render
        time.sleep(2)
        
        video_cards = page.locator('div.group')
        count = video_cards.count()
        
        if count == 0:
            print("No videos found immediately. Checking console...")
            def handle_console(msg):
                print(f"BROWSER CONSOLE [{msg.type}]: {msg.text}")
            page.on("console", handle_console)
            page.screenshot(path='/workspace/debug_home_1.png')
            time.sleep(5)
            
            video_cards = page.locator('div.group')
            count = video_cards.count()
            print("No videos found. Clicking settings to force load if needed...")
            # If not found, maybe we need to go to settings to set it manually
            go_to_settings_btn = page.get_by_role("button", name="去设置")
            if go_to_settings_btn.is_visible():
                go_to_settings_btn.click()
                time.sleep(2)
                input_field = page.locator('input[type="text"]').first
                input_field.fill('http://mock.api')
                save_btn = page.get_by_role("button", name="保存并加载")
                save_btn.click()
                time.sleep(2)
                back_btn = page.get_by_role("button", name="返回首页")
                if back_btn.is_visible():
                    back_btn.click()
                else:
                    home_btn = page.locator('aside a[href="#/"]').first
                    if home_btn.is_visible():
                        home_btn.click()
                time.sleep(2)
            
            # Click sidebar site button
            aside_buttons = page.locator('aside button')
            if aside_buttons.count() > 0:
                first_site_btn = aside_buttons.first
                if first_site_btn.is_visible():
                    first_site_btn.click()
                    time.sleep(2)
            
            video_cards = page.locator('div.group')
            count = video_cards.count()
            
        print(f"✓ Found {count} video cards.")
        if count == 0:
            print("✗ Test Failed: No video cards rendered.")
            browser.close()
            exit(1)
            
        # 2. Click the first video
        print("2. Clicking the first video to go to Detail page...")
        video_cards.first.click()
        page.wait_for_load_state('domcontentloaded')
        time.sleep(2)
        
        # 3. Check Detail Page
        print("3. Checking Detail page...")
        episodes = page.locator('button')
        ep_count = episodes.count()
        if ep_count > 0:
            print(f"✓ Found {ep_count} episodes.")
            
            # 4. Click an episode to play
            print("4. Clicking first episode to play...")
            ep_btn = page.get_by_text("第1集").first
            if ep_btn.is_visible():
                ep_btn.click()
            else:
                episodes.nth(1).click() # fallback click second button just in case
            page.wait_for_load_state('domcontentloaded')
            time.sleep(3)
            
            # 5. Check Play Page
            print("5. Checking Play page...")
            video_player = page.locator('.art-video')
            if video_player.is_visible():
                print("✓ Video player found!")
            else:
                print("✗ Video player not found.")
                browser.close()
                exit(1)
        else:
            print("✗ No episodes found on Detail page.")
            browser.close()
            exit(1)

        print("🎉 All steps passed successfully!")
        browser.close()

if __name__ == "__main__":
    test_full_flow()
