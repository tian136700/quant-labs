export type LessonTeacherNameRef = {
  id: number;
  name: string;
};

export type LessonTeacherNamePlan = {
  name: string;
  renames: LessonTeacherNameRef[];
};

/** 在已有名称中分配「base1 / base2 …」，base 本身若未被占用则优先使用。 */
export function allocateNumberedTeacherName(
  base: string,
  occupied: Set<string>
): string {
  if (!occupied.has(base)) return base;
  let suffix = 1;
  while (occupied.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

/** 新增老师：重名时先把已有同名改为 base1，新老师用下一个可用编号。 */
export function planLessonTeacherNameForCreate(
  requestedName: string,
  teachers: LessonTeacherNameRef[]
): LessonTeacherNamePlan {
  const base = requestedName.trim();
  const occupied = new Set(teachers.map((teacher) => teacher.name));

  if (!occupied.has(base)) {
    return { name: base, renames: [] };
  }

  const renames: LessonTeacherNameRef[] = [];
  for (const teacher of teachers) {
    if (teacher.name !== base) continue;
    const renamed = allocateNumberedTeacherName(base, occupied);
    renames.push({ id: teacher.id, name: renamed });
    occupied.delete(teacher.name);
    occupied.add(renamed);
  }

  return {
    name: allocateNumberedTeacherName(base, occupied),
    renames,
  };
}

/** 修改称呼：与已有名称冲突时自动加编号，不改动其他老师。 */
export function planLessonTeacherNameForUpdate(
  teacherId: number,
  requestedName: string,
  teachers: LessonTeacherNameRef[],
  reservedNames: Set<string> = new Set()
): LessonTeacherNamePlan {
  const base = requestedName.trim();
  const occupied = new Set<string>([
    ...teachers.filter((teacher) => teacher.id !== teacherId).map((teacher) => teacher.name),
    ...reservedNames,
  ]);

  return {
    name: allocateNumberedTeacherName(base, occupied),
    renames: [],
  };
}
