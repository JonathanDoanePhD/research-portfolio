export function mountHoverCities(cities, labels, project) {
  const label = document.createElement('span');
  label.className = 'map-label';
  label.hidden = true;
  labels.append(label);

  function hide() {
    label.hidden = true;
  }

  function show(x,y) {
    let nearest;
    let best = 14**2;
    for (const city of cities) {
      const [left,top] = project(city.x,city.z);
      const distance = (x-left)**2+(y-top)**2;
      if (distance < best) {
        best = distance;
        nearest = {city,left,top};
      }
    }
    if (!nearest) {
      hide();
      return false;
    }
    label.textContent = nearest.city.name;
    label.style.left = `${nearest.left}px`;
    label.style.top = `${nearest.top}px`;
    label.hidden = false;
    return true;
  }

  return {show,hide};
}
