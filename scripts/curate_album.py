"""Validate reviewed scene assignments and enrich the public album, without guessed dates."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def enrich(album, curation):
    items = {item['id']: item for item in album['items']}
    rank = {item['id']: i for i, item in enumerate(album['items'])}
    categories = {category['id']: category for category in curation['categories']}
    counts = Counter(id for story in curation['stories'] for id in story['itemIds'])
    if set(counts) != set(items) or any(count != 1 for count in counts.values()):
        raise ValueError(f'Every media item needs exactly one reviewed scene. Missing: {set(items)-set(counts)}; extra: {set(counts)-set(items)}')
    stories = []
    for original in curation['stories']:
        story = dict(original)
        assert story['category'] in categories and story['coverId'] in story['itemIds']
        story['itemIds'] = sorted(story['itemIds'], key=rank.get)
        members = [items[id] for id in story['itemIds']]
        dates = [item['date'] for item in members if item['date']]
        # Visually related undated media stay separate from dated scenes.
        assert not dates or len(dates) == len(members), story['id']
        story['date'] = min(dates) if dates else None
        story['endDate'] = max(dates) if dates else None
        story['photoCount'] = sum(item['kind'] == 'image' for item in members)
        story['videoCount'] = sum(item['kind'] == 'video' for item in members)
        for item in members:
            item.update(storyId=story['id'], category=story['category'], alt=story['alt'])
        stories.append(story)
    stories.sort(key=lambda story: (story['date'] or '9999', min(rank[id] for id in story['itemIds'])))
    for category in categories.values():
        assert items[category['coverId']]['category'] == category['id']
    album['categories'] = list(categories.values())
    album['stories'] = stories
    return album

def main():
    path = ROOT / 'data/memories.json'
    album = json.loads(path.read_text(encoding='utf-8'))
    curation = json.loads((ROOT / 'data/curation.json').read_text(encoding='utf-8'))
    album = enrich(album, curation)
    path.write_text(json.dumps(album, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = ROOT / 'planning/추억-분류표.csv'
    report.parent.mkdir(parents=True, exist_ok=True)
    with report.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['사진첩', '추억 제목', '확인된 날짜', '사진 수', '영상 수', '파일 식별자'])
        categories = {x['id']: x['title'] for x in album['categories']}
        for story in album['stories']:
            writer.writerow([categories[story['category']], story['title'], story['date'] or '', story['photoCount'], story['videoCount'], ','.join(story['itemIds'])])
    print(f"Curated {len(album['stories'])} scenes in {len(album['categories'])} albums; {len(album['items'])} media preserved.")

if __name__ == '__main__': main()
