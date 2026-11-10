"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str, int } from "@/lib/action";
import { audit } from "@/lib/audit";
import { ROOM_TYPES } from "@/lib/catalog";

function roomFields(fd: FormData) {
  const roomName = str(fd, "name");
  if (!roomName) throw new Error("Nhập tên phòng");
  const roomType = str(fd, "roomType") || "THUONG";
  if (!(roomType in ROOM_TYPES)) throw new Error("Loại phòng không hợp lệ");
  const capacity = int(fd, "capacity", 40);
  if (capacity < 1) throw new Error("Sức chứa phải lớn hơn 0");
  return { roomName, roomType, capacity };
}

export const createRoom = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const data = roomFields(fd);
  if (await db.room.findUnique({ where: { roomName: data.roomName } })) throw new Error("Đã có phòng cùng tên");
  const r = await db.room.create({ data });
  await audit(me.email, "create_room", "Room", r.id);
  revalidatePath("/phong-hoc");
});

export const updateRoom = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const data = roomFields(fd);
  if (await db.room.findFirst({ where: { roomName: data.roomName, id: { not: id } } })) throw new Error("Đã có phòng cùng tên");
  const examRooms = await db.examRoom.findMany({ where: { roomId: id, paper: { event: { status: { not: "CANCELLED" } }, endsAt: { gt: new Date() } } }, include: { _count: { select: { seats: true } } } });
  if (examRooms.some((room) => room._count.seats > data.capacity)) throw new Error("Sức chứa mới không đủ cho lịch thi đã xếp ở phòng này");
  await db.room.update({ where: { id }, data });
  await audit(me.email, "update_room", "Room", id);
  revalidatePath("/phong-hoc");
  revalidatePath(`/phong-hoc/${id}`);
});

export const deleteRoom = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  if (await db.schoolClass.count({ where: { roomId: id } })) throw new Error("Phòng đang được phân công cố định cho lớp, hãy đổi phòng của lớp trước");
  if (await db.timetableSlot.count({ where: { roomId: id } })) throw new Error("Phòng đang được xếp trong thời khoá biểu, hãy chuyển các tiết sang phòng khác trước");
  if (await db.examRoom.count({ where: { roomId: id } })) throw new Error("Phòng có lịch sử thi, không thể xóa");
  await db.room.delete({ where: { id } });
  await audit(me.email, "delete_room", "Room", id);
  revalidatePath("/phong-hoc");
  redirect("/phong-hoc");
});
