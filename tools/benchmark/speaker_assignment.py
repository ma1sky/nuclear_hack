"""Exact maximum overlap matching in O(reference_speakers**2 * clusters)."""
def maximum_overlap(overlap):
    rows, columns = overlap.shape
    if not rows or not columns:
        return 0
    width = max(rows, columns)
    u, v, p, way = [0]*(rows+1), [0]*(width+1), [0]*(width+1), [0]*(width+1)
    for row in range(1, rows+1):
        p[0] = row
        current = 0
        minimum, used = [float('inf')]*(width+1), [False]*(width+1)
        while True:
            used[current] = True
            active = p[current]
            delta, following = float('inf'), 0
            for column in range(1, width+1):
                if used[column]:
                    continue
                cost = -int(overlap[active-1, column-1]) if column <= columns else 0
                reduced = cost-u[active]-v[column]
                if reduced < minimum[column]:
                    minimum[column], way[column] = reduced, current
                if minimum[column] < delta:
                    delta, following = minimum[column], column
            for column in range(width+1):
                if used[column]:
                    u[p[column]] += delta
                    v[column] -= delta
                else:
                    minimum[column] -= delta
            current = following
            if not p[current]:
                break
        while current:
            previous = way[current]
            p[current] = p[previous]
            current = previous
    return sum(int(overlap[p[column]-1,column-1]) for column in range(1,columns+1) if p[column])
