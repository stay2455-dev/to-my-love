# to-my-love
사랑하는 사람에게

## 사이트

주소: https://stay2455-dev.github.io/to-my-love/

함께한 사진과 영상을 모은 정적 사진첩입니다. 연도 선택, 월별 사진 펼치기,
전체 비율 사진 보기, 키보드·터치 탐색, 수동 영상 재생을 지원합니다.

미리보기에는 HTTP 서버가 필요합니다. 예: `python -m http.server 4173`.
`file://`로 열면 브라우저 보안 정책 때문에 사진 목록을 읽을 수 없습니다.

## 자료

- `data/memories.json`: 날짜순 사진·영상 목록. 날짜가 없으면 추측하지 않습니다.
- `assets/album/`: 공개용 WebP 이미지·미리보기와 H.264/AAC 영상.
- `scripts/catalog_media.py`: 로컬 `사진/` 원본에서 촬영 날짜와 중복을 확인합니다.
- `scripts/date-overrides.json`: 사진 자체에 인쇄된 날짜를 직접 확인한 예외 기록.
- `scripts/prepare_media.py`: 원본을 변경하지 않고 공개 사본과 목록을 만듭니다.

사진 원본과 내부 정리 자료는 Git에서 제외합니다. 재생성에는 Python, Pillow,
imageio-ffmpeg가 필요합니다. `planning/runtime` 설치 또는 일반 Python 환경을 사용할 수 있습니다.
순서: `python scripts/catalog_media.py`, `python scripts/prepare_media.py`.

## 검사

`npm install --prefix planning/test-runtime jsdom@26.1.0` 후
`node --test scripts/test_album.cjs`로 목록·분류·탐색 동작을 검사합니다.
DOM 검사는 실제 화면 배치나 기기별 재생 검사를 대체하지 않습니다.

## 글꼴

제목은 [네이버 마루 부리](https://hangeul.naver.com/font),
화면 글자는 [Pretendard](https://github.com/orioncactus/pretendard)를 사용합니다.
글꼴 배포 라이선스는 `assets/fonts/`에 포함되어 있습니다.

## 배포

GitHub Pages에서 `main` 브랜치의 루트(`/`)를 게시 대상으로 사용합니다.
`index.html`을 수정하고 `main`에 반영하면 사이트가 자동으로 갱신됩니다.
`.nojekyll`은 파일을 그대로 게시하기 위한 설정입니다.

페이지에는 검색 엔진에 색인하지 않도록 `noindex`가 설정되어 있습니다.
이는 접근 제한 기능이 아니며, 사이트 주소를 아는 사람은 페이지를 볼 수 있습니다.
