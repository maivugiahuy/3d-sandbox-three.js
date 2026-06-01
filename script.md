# Script thuyết trình — 15 phút

> Ghi chú: `[SLIDE X]` = chuyển slide. `[DEMO]` = thao tác trực tiếp trên chương trình. `[~Xp]` = thời gian dự kiến.

---

## SLIDE 1 — Trang bìa `[~30s]`

Xin chào thầy và các bạn.

Em tên là *(tên)*, MSSV *(mã số)*. Hôm nay em xin trình bày đồ án môn Đồ họa máy tính với đề tài: **"Xây dựng chương trình Sandbox 3D tương tác thời gian thực"**.

Chương trình lấy cảm hứng từ game Garry's Mod — một trò chơi sandbox nổi tiếng — được xây dựng hoàn toàn trên nền web bằng Three.js và Rapier physics engine.

---

## SLIDE 2 — Mục tiêu đồ án `[~1p30s]`

`[SLIDE 2]`

Đồ án có 4 mục tiêu chính.

**Thứ nhất**, xây dựng một môi trường 3D sandbox tương tác thời gian thực chạy trên trình duyệt web. Người dùng mở link là chơi được ngay, không cần cài đặt gì.

**Thứ hai**, áp dụng các kỹ thuật đồ họa 3D đã học trong môn: phép chiếu phối cảnh, phép biến đổi Affine — bao gồm translate, rotate, scale — mô hình chiếu sáng, đổ bóng, và texture mapping.

**Thứ ba**, tích hợp mô phỏng vật lý bao gồm va chạm, trọng lực, và lực nổi. Mục đích là khi người dùng tương tác với vật thể, mọi thứ phản ứng một cách chân thực.

**Thứ tư**, cho phép người dùng tự do sáng tạo — tạo vật thể, di chuyển, xoay, co giãn, sơn màu, và tùy chỉnh môi trường theo ý muốn.

---

## SLIDE 3 — Ý tưởng chương trình `[~2p]`

`[SLIDE 3]`

Về ý tưởng tổng quan: chương trình là một **sandbox 3D góc nhìn thứ nhất**. Giống như trong game FPS, người dùng dùng chuột để nhìn xung quanh, WASD để di chuyển, và tương tác với thế giới 3D xung quanh mình.

Điểm khác biệt là đây không phải game bắn súng — đây là **sandbox sáng tạo**. Người dùng có thể:
- Tạo ra các vật thể 3D bất kỳ lúc nào bằng menu spawn
- Dùng hệ thống **Gravity Gun** với 8 chế độ khác nhau để thao tác vật thể: cầm nắm, ném, đóng băng, dịch chuyển, xoay, co giãn, sơn màu, và tạo animation
- Thay đổi môi trường: góc mặt trời, bóng đổ

Về mặt kỹ thuật, chương trình chạy hoàn toàn trên trình duyệt. Em dùng **Three.js** cho đồ họa 3D và **Rapier** — một physics engine viết bằng Rust, biên dịch sang WebAssembly — cho mô phỏng vật lý. Không cần bundler hay build step — chỉ cần import map của ES modules.

Nguồn cảm hứng chính là Garry's Mod — một game sandbox kinh điển trên PC. Em muốn đưa trải nghiệm tương tự lên web, ai cũng truy cập được.

---

## SLIDE 4 — Các chức năng chính `[~3p]`

`[SLIDE 4]`

Chương trình có 8 nhóm chức năng chính. Em xin đi qua từng nhóm.

### Spawn vật thể

Người dùng giữ phím Q để mở menu spawn. Có **13 loại khối cơ bản** — cube, sphere, cone, cylinder, capsule, torus knot, teapot, và nhiều loại khác. Ngoài ra có hơn **20 model GLTF** được auto-scan từ thư mục assets — thùng hàng, container, sofa, xe tăng. Chỉ cần thả file GLTF vào thư mục, reload là model tự động xuất hiện trong menu.

Khi spawn, vật thể tự động snap xuống mặt đất bằng kỹ thuật **raycast** — bắn tia từ trên xuống tìm điểm chạm.

### Gravity Gun — 8 chế độ

Đây là hệ thống tương tác chính, cuộn chuột để chuyển chế độ:
- **Freeze**: cầm vật thể bằng lò xo vật lý, thả hoặc đóng băng tại chỗ
- **Shoot**: cầm rồi bắn vật thể bay đi với tốc độ cao
- **Translate, Rotate, Scale**: chọn vật thể rồi dùng slider điều chỉnh vị trí, góc xoay, kích thước theo từng trục X, Y, Z riêng biệt. Đây chính là phép biến đổi Affine.
- **Paint**: đổi màu bằng color picker hoặc áp texture từ file
- **Sun**: điều chỉnh góc chiếu mặt trời — thay đổi bóng đổ real-time
- **Animate**: gán animation có sẵn hoặc ghi keyframe tùy chỉnh

### Camera và Player

Camera góc nhìn thứ nhất, sử dụng **Pointer Lock** để nhốt chuột. Phép chiếu phối cảnh với FOV 75 độ. Character controller xử lý va chạm, bước lên bậc thang tự động, và trượt dốc. Có chế độ bay bấm V — tắt trọng lực, di chuyển tự do trong không gian.

### Vật lý

Rapier engine xử lý trọng lực, va chạm rigid body. Character controller có coyote time — cho phép nhảy trong vài frame sau khi rời mặt đất — và jump buffer. Vùng nước có lực nổi: vật thể rơi xuống sẽ nổi lên theo đúng vật lý.

### Undo

Phím Z hoàn tác thao tác gần nhất. Stack 30 bước, hỗ trợ undo cho mọi thao tác: spawn, paint, transform, thay đổi góc mặt trời.

---

## SLIDE 5 — Kỹ thuật đồ họa `[~3p]`

`[SLIDE 5]`

Slide này em trình bày các kỹ thuật đồ họa đã áp dụng.

### Phép chiếu phối cảnh

Sử dụng **Perspective Projection** — vật ở xa nhỏ hơn, vật ở gần lớn hơn, tạo cảm giác chiều sâu giống mắt người. Camera setup với FOV 75 độ, near plane 0.1, far plane 5000 đơn vị.

### Phép biến đổi Affine

Đây là phần trọng tâm. Chương trình cho phép người dùng thực hiện cả 3 phép biến đổi Affine:
- **Translation** — dịch chuyển vật thể theo 3 trục bằng slider. Nội bộ sử dụng phép nhân ma trận 4×4.
- **Rotation** — xoay vật thể quanh trục X, Y, Z. Sử dụng Quaternion để tránh hiện tượng gimbal lock.
- **Scaling** — co giãn không đều theo từng trục. Đặc biệt, khi scale, chương trình phải rebuild lại collider vật lý cho khớp hình dạng mới.

Người dùng điều khiển cả 3 phép biến đổi này trực tiếp qua slider panel, thấy kết quả ngay lập tức.

### Chiếu sáng

Dùng 2 nguồn sáng:
- **Hemisphere Light**: ánh sáng bao quanh, nửa trên sáng trắng, nửa dưới xám — mô phỏng ánh sáng tán xạ từ bầu trời và mặt đất.
- **Directional Light**: ánh sáng mặt trời, tính hướng từ 2 tham số elevation và azimuth. Người dùng điều chỉnh được qua Sun mode.

Material sử dụng **MeshStandardMaterial** — mô hình PBR (Physically-Based Rendering) với 2 tham số chính là roughness và metalness. Tone mapping dùng ACES Filmic cho màu sắc điện ảnh.

### Đổ bóng — Shadow Mapping

Kỹ thuật **shadow mapping**: render scene từ góc nhìn nguồn sáng vào depth buffer (shadow map) kích thước 2048×2048. Khi render chính, so sánh độ sâu để xác định điểm nào bị che. Dùng **PCF Soft Shadow** cho bóng mềm, tự nhiên hơn.

### Texture Mapping

Áp ảnh 2D lên bề mặt mesh 3D. Hỗ trợ PNG với alpha transparency — ví dụ texture cỏ có viền trong suốt. Nước dùng normal map để tạo hiệu ứng gợn sóng.

### Procedural Sky

Bầu trời tạo bằng **mô hình Preetham** — tính toán màu sắc dựa trên tham số vật lý: turbidity (độ đục khí quyển), rayleigh scattering (tán xạ tạo màu xanh trời), và mie scattering (tán xạ tạo quầng sáng quanh mặt trời). Thay đổi góc mặt trời sẽ thay đổi toàn bộ bầu trời — từ trưa nắng đến hoàng hôn.

### Hiệu ứng nước

Water shader kết hợp phản xạ, khúc xạ, và normal map distortion. Sóng nước thay đổi theo thời gian. Vật lý lực nổi: vật thể chìm trong vùng nước bị đẩy lên theo nguyên lý Archimedes.

---

## SLIDE 6 — Demo `[~4p]`

---

## SLIDE 7 — Kết quả, hạn chế, hướng phát triển `[~1p30s]`

`[SLIDE 7]`

### Kết quả

Đồ án đã xây dựng thành công một ứng dụng sandbox 3D hoàn chỉnh trên web. Tích hợp đầy đủ các kỹ thuật đồ họa yêu cầu: phép chiếu phối cảnh, biến đổi Affine, chiếu sáng, shadow mapping, texture mapping, procedural sky, và water shader.

Hệ thống vật lý mô phỏng chân thực với trọng lực, va chạm, và lực nổi. Hệ thống tương tác phong phú: 8 chế độ gravity gun, 13 loại primitive, hơn 20 model GLTF.

Kiến trúc gồm 7 module ES tách biệt, cấu hình qua file JSON, không cần bundler.

### Hạn chế

Chương trình hiện chỉ hỗ trợ một người chơi, chưa có multiplayer. Chưa có tính năng lưu và tải scene. Performance giảm khi spawn quá nhiều vật thể do physics step nặng. Collider cho model chỉ hỗ trợ convex hull — chưa xử lý được hình dạng lõm phức tạp.

### Hướng phát triển

Trong tương lai có thể phát triển thêm:
- Multiplayer qua WebSocket cho nhiều người chơi cùng lúc
- Save/Load scene ra JSON để lưu và chia sẻ
- Constraint system — nối vật thể bằng bản lề, dây, lò xo
- Thêm hiệu ứng post-processing: bloom, SSAO, motion blur

---

## Kết thúc `[~30s]`

Trên đây là toàn bộ nội dung đồ án. Em xin cảm ơn thầy đã lắng nghe.

Thầy có câu hỏi gì em xin được giải đáp ạ.

---
