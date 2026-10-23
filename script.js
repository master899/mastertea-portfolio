const projects = [
  {
    title: 'Multilingual Tuberculosis Screening & Risk Assessment',
    body:
      'This final-year project focused on designing a rule-based clinical decision support system for tuberculosis screening and risk assessment. It included multilingual questionnaire support in English, Yoruba, Hausa, and Igbo, along with decision logic to process user responses and guide risk evaluation.',
    tech: 'Python, Flask, HTML, CSS, JavaScript, MySQL'
  },
  {
    title: 'Web-Based Departmental Portal',
    body:
      'This academic project involved creating a departmental portal for communication, scheduling, academic information sharing, and event coordination. It helped improve access to information while using a database-backed structure for managing relevant content and records.',
    tech: 'HTML, CSS, JavaScript, Database Design'
  },
  {
    title: 'Smart Campus Transport Booking System',
    body:
      'This project focused on designing a campus transportation booking interface that simplified booking workflows and provided a solid foundation for managing booking-related data. It emphasized usability, clarity, and practical system design.',
    tech: 'Web Application Development, Databases, Front-End Design'
  }
];

const currentYear = document.getElementById('year');
if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

const portfolioStorageKey = 'ayomide-portfolio-entries-v1';
const screenshotDatabaseName = 'ayomide-portfolio-screenshots-v1';
const emptyPortfolioEntries = {
  projects: [],
  skills: [],
  achievements: [],
  certificates: []
};
const managerStatus = document.getElementById('manager-status');
let portfolioEntries = emptyPortfolioEntries;
let portfolioStorageReady = true;
let screenshotDatabasePromise;
const projectGalleryObjectUrls = new Set();
const manageSection = document.getElementById('manage');

if (manageSection && new URLSearchParams(window.location.search).get('manage') === '1') {
  manageSection.hidden = false;
}

const setManagerStatus = (message, isError = false) => {
  if (!managerStatus) return;

  managerStatus.textContent = message;
  managerStatus.dataset.error = String(isError);
};

const isStoredEntry = (entry, collection) => {
  if (
    entry === null ||
    typeof entry !== 'object' ||
    typeof entry.id !== 'string' ||
    typeof entry.title !== 'string'
  ) {
    return false;
  }

  if (collection === 'projects') {
    return (
      typeof entry.description === 'string' &&
      Array.isArray(entry.technologies) &&
      entry.technologies.every((technology) => typeof technology === 'string')
    );
  }

  if (collection === 'skills') return typeof entry.category === 'string';

  return (
    typeof entry.issuer === 'string' &&
    typeof entry.year === 'string' &&
    (collection !== 'achievements' || typeof entry.description === 'string')
  );
};

const loadPortfolioEntries = () => {
  try {
    const storedValue = localStorage.getItem(portfolioStorageKey);
    if (!storedValue) return;

    const parsedValue = JSON.parse(storedValue);
    const collections = ['projects', 'skills', 'achievements', 'certificates'];
    if (
      parsedValue === null ||
      typeof parsedValue !== 'object' ||
      collections.some(
        (collection) =>
          !Array.isArray(parsedValue[collection]) ||
          !parsedValue[collection].every((entry) => isStoredEntry(entry, collection))
      )
    ) {
      throw new Error('Saved portfolio data has an invalid format.');
    }

    portfolioEntries = parsedValue;
  } catch (error) {
    portfolioStorageReady = false;
    setManagerStatus(
      error instanceof SyntaxError
        ? 'Saved portfolio data could not be read. The manager is disabled to protect your existing entries.'
        : 'Browser storage is unavailable or the saved portfolio data is invalid. The manager is disabled.',
      true
    );
  }
};

const savePortfolioEntries = (entries) => {
  try {
    localStorage.setItem(portfolioStorageKey, JSON.stringify(entries));
    return true;
  } catch {
    setManagerStatus(
      'Could not save changes in this browser. Check available browser storage and try again.',
      true
    );
    return false;
  }
};

const openScreenshotDatabase = () => {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support persistent screenshot storage.'));
  }
  if (screenshotDatabasePromise) return screenshotDatabasePromise;

  screenshotDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(screenshotDatabaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projectScreenshots')) {
        database.createObjectStore('projectScreenshots', { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open screenshot storage.'));
    request.onblocked = () => reject(new Error('Screenshot storage is blocked by another open page.'));
  });
  return screenshotDatabasePromise;
};

const saveProjectScreenshots = async (projectId, files) => {
  const database = await openScreenshotDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('projectScreenshots', 'readwrite');
    transaction.objectStore('projectScreenshots').put({ projectId, files });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not save project screenshots.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving project screenshots was cancelled.'));
  });
};

const getProjectScreenshots = async (projectId) => {
  const database = await openScreenshotDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('projectScreenshots', 'readonly');
    const request = transaction.objectStore('projectScreenshots').get(projectId);
    request.onsuccess = () => resolve(request.result?.files || []);
    request.onerror = () => reject(request.error || new Error('Could not read project screenshots.'));
  });
};

const deleteProjectScreenshots = async (projectId) => {
  const database = await openScreenshotDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('projectScreenshots', 'readwrite');
    transaction.objectStore('projectScreenshots').delete(projectId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove project screenshots.'));
    transaction.onabort = () => reject(transaction.error || new Error('Removing project screenshots was cancelled.'));
  });
};

const createElement = (tagName, className, text) => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

const createDeleteButton = (collection, entry) => {
  const button = createElement('button', 'entry-delete', 'Remove');
  button.type = 'button';
  button.dataset.deleteCollection = collection;
  button.dataset.deleteId = entry.id;
  button.setAttribute('aria-label', `Remove ${entry.title}`);
  return button;
};

const renderEmptyMessage = (container, message) => {
  const emptyMessage = createElement('p', 'empty-entry', message);
  container.replaceChildren(emptyMessage);
};

const createProjectGallery = (project) => {
  const gallery = createElement('figure', 'project-gallery saved-project-gallery');
  gallery.setAttribute('aria-label', `${project.title} screenshots`);

  const image = createElement('img', 'gallery-image');
  image.alt = `${project.title} screenshot`;

  const placeholder = createElement('div', 'screenshot-placeholder');
  placeholder.append(
    createElement('span', 'placeholder-icon', '</>'),
    createElement('span', '', 'No screenshots added')
  );

  const controls = createElement('div', 'gallery-controls');
  controls.hidden = true;
  const previous = createElement('button', 'gallery-previous', '‹');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Previous screenshot');
  const count = createElement('span', 'gallery-count');
  count.setAttribute('aria-live', 'polite');
  const next = createElement('button', 'gallery-next', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next screenshot');
  controls.append(previous, count, next);
  gallery.append(image, placeholder, controls);
  return gallery;
};

const renderSavedProjects = async () => {
  const container = document.getElementById('saved-projects');
  if (!container) return;

  projectGalleryObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  projectGalleryObjectUrls.clear();
  container.replaceChildren();
  for (const project of portfolioEntries.projects) {
    const card = createElement('article', 'project-card saved-project-card');
    const gallery = createProjectGallery(project);
    const body = createElement('div', 'project-body');
    const title = createElement('h3', '', project.title);
    const description = createElement('p', '', project.description);
    body.append(title, description);

    if (project.technologies.length > 0) {
      const tags = createElement('div', 'tags');
      project.technologies.forEach((technology) => {
        tags.append(createElement('span', '', technology));
      });
      body.append(tags);
    }

    body.append(createDeleteButton('projects', project));
    card.append(gallery, body);
    container.append(card);

    try {
      const files = await getProjectScreenshots(project.id);
      const imageSources = files.map((file) => ({
        src: URL.createObjectURL(file),
        revokeOnChange: true
      }));
      imageSources.forEach((source) => projectGalleryObjectUrls.add(source.src));
      initializeGallery(gallery, imageSources);
    } catch (error) {
      gallery.querySelector('.screenshot-placeholder span:last-child').textContent =
        'Screenshots could not be loaded';
      setManagerStatus(error.message || 'Could not load project screenshots.', true);
    }
  }
};

const renderSavedSkills = () => {
  const container = document.getElementById('saved-skills');
  if (!container) return;

  container.replaceChildren();
  portfolioEntries.skills.forEach((skill) => {
    const card = createElement('article', 'skill-box saved-skill');
    const heading = createElement('h3', '', skill.title);
    const details = createElement('div', 'saved-skill-details');
    if (skill.category) details.append(createElement('p', '', skill.category));
    details.append(createDeleteButton('skills', skill));
    card.append(heading, details);
    container.append(card);
  });
};

const renderRecognitionList = (containerId, collection, emptyMessage) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const entries = portfolioEntries[collection];
  if (entries.length === 0) {
    renderEmptyMessage(container, emptyMessage);
    return;
  }

  container.replaceChildren();
  entries.forEach((entry) => {
    const card = createElement('article', 'saved-entry');
    const content = createElement('div', 'saved-entry-content');
    const subtitle = [entry.issuer, entry.year].filter(Boolean).join(' · ');
    content.append(createElement('h4', '', entry.title));
    if (subtitle) content.append(createElement('p', 'saved-entry-meta', subtitle));
    if (entry.description) content.append(createElement('p', '', entry.description));
    card.append(content, createDeleteButton(collection, entry));
    container.append(card);
  });
};

const renderPortfolioEntries = () => {
  void renderSavedProjects();
  renderSavedSkills();
  renderRecognitionList('saved-achievements', 'achievements', 'No additional achievements added yet.');
  renderRecognitionList('saved-certificates', 'certificates', 'No additional certificates added yet.');
};

loadPortfolioEntries();
renderPortfolioEntries();

const menu = document.getElementById('menu');
const links = document.getElementById('links');
const modal = document.getElementById('modal');
const closeButton = document.getElementById('close');

if (menu && links) {
  menu.addEventListener('click', () => {
    const isOpen = links.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(isOpen));
  });

  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      links.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
    });
  });
}

const initializeGallery = (gallery, initialImages = null) => {
  const image = gallery.querySelector('.gallery-image');
  const controls = gallery.querySelector('.gallery-controls');
  const counter = gallery.querySelector('.gallery-count');
  const previousButton = gallery.querySelector('.gallery-previous');
  const nextButton = gallery.querySelector('.gallery-next');
  const fileInput = gallery.querySelector('.gallery-file-input');
  const uploadNote = gallery.parentElement.querySelector('.upload-note');
  const imagePaths = (gallery.dataset.images || '')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!image || !controls || !counter || !previousButton || !nextButton) return;

  const loadImage = (path) =>
    new Promise((resolve) => {
      const candidate = new Image();
      candidate.onload = () => resolve({ src: path, revokeOnChange: false });
      candidate.onerror = () => resolve(null);
      candidate.src = path;
    });

  let availableImages = [];
  let activeIndex = 0;

  const showImage = (index) => {
    if (availableImages.length === 0) return;

    activeIndex = (index + availableImages.length) % availableImages.length;
    image.src = availableImages[activeIndex].src;
    image.alt = `Project screenshot ${activeIndex + 1} of ${availableImages.length}`;
    counter.textContent = `${activeIndex + 1} / ${availableImages.length}`;
    controls.hidden = availableImages.length < 2;
    gallery.classList.add('has-images');
  };

  const replaceImages = (images) => {
    availableImages
      .filter((entry) => entry.revokeOnChange)
      .forEach((entry) => URL.revokeObjectURL(entry.src));
    availableImages = images;
    activeIndex = 0;
    gallery.classList.toggle('has-images', availableImages.length > 0);
    controls.hidden = availableImages.length < 2;

    if (availableImages.length > 0) {
      showImage(0);
    } else {
      image.removeAttribute('src');
      counter.textContent = '';
    }
  };

  previousButton.addEventListener('click', () => showImage(activeIndex - 1));
  nextButton.addEventListener('click', () => showImage(activeIndex + 1));

  if (fileInput) fileInput.addEventListener('change', () => {
    const selectedFiles = Array.from(fileInput.files || []);
    if (selectedFiles.length === 0) return;

    if (selectedFiles.length > 5) {
      if (uploadNote) {
        uploadNote.textContent = 'Please select no more than five images at a time.';
      }
      fileInput.value = '';
      return;
    }

    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length !== selectedFiles.length) {
      if (uploadNote) {
        uploadNote.textContent = 'Only image files are supported. Please choose up to five images.';
      }
      fileInput.value = '';
      return;
    }

    replaceImages(
      imageFiles.map((file) => ({
        src: URL.createObjectURL(file),
        revokeOnChange: true
      }))
    );

    if (uploadNote) {
      uploadNote.textContent = `${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} selected. Local preview only; not saved online.`;
    }
    fileInput.value = '';
  });

  if (initialImages) {
    replaceImages(initialImages);
    return;
  }

  Promise.all(imagePaths.map(loadImage)).then((results) => {
    const bundledImages = results.filter((entry) => entry !== null);
    if (availableImages.length === 0) replaceImages(bundledImages);
  });
};

document.querySelectorAll('[data-gallery]').forEach((gallery) => initializeGallery(gallery));

document.querySelectorAll('.details').forEach((button) => {
  button.addEventListener('click', () => {
    const projectIndex = Number(button.dataset.project);
    const project = projects[projectIndex];
    const modalBody = document.getElementById('modalBody');

    if (!project || !modalBody) return;

    modalBody.replaceChildren();

    const title = document.createElement('h2');
    title.textContent = project.title;

    const description = document.createElement('p');
    description.textContent = project.body;

    const technologies = document.createElement('p');
    technologies.textContent = `Technologies: ${project.tech}`;

    modalBody.append(title, description, technologies);
    modal.showModal();
  });
});

if (closeButton) {
  closeButton.addEventListener('click', () => {
    modal.close();
  });
}

document.querySelectorAll('[data-entry-form]').forEach((form) => {
  const screenshotInput = form.querySelector('input[name="screenshots"]');
  const screenshotNote = document.getElementById('project-screenshots-note');

  if (screenshotInput) {
    screenshotInput.addEventListener('change', () => {
      const files = Array.from(screenshotInput.files || []);
      if (files.length > 5) {
        screenshotNote.textContent = 'Please choose no more than five screenshots.';
        screenshotNote.dataset.error = 'true';
        return;
      }
      if (files.some((file) => !file.type.startsWith('image/'))) {
        screenshotNote.textContent = 'Only image files are supported.';
        screenshotNote.dataset.error = 'true';
        return;
      }

      screenshotNote.textContent = files.length
        ? `${files.length} screenshot${files.length === 1 ? '' : 's'} selected. They will be saved in this browser and shown in this project's gallery.`
        : 'Selected screenshots are saved in this browser and shown in the project gallery.';
      screenshotNote.dataset.error = 'false';
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!portfolioStorageReady) {
      setManagerStatus('The manager is disabled because saved data could not be loaded.', true);
      return;
    }

    const formData = new FormData(form);
    const collection = form.dataset.entryForm;
    const title = String(formData.get('title') || '').trim();
    if (
      !title ||
      !['projects', 'skills', 'achievements', 'certificates'].includes(collection)
    ) {
      return;
    }

    const entry = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title
    };

    if (collection === 'projects') {
      entry.description = String(formData.get('description') || '').trim();
      entry.technologies = String(formData.get('technologies') || '')
        .split(',')
        .map((technology) => technology.trim())
        .filter(Boolean);
    } else if (collection === 'skills') {
      entry.category = String(formData.get('category') || '').trim();
    } else {
      entry.issuer = String(formData.get('issuer') || '').trim();
      entry.year = String(formData.get('year') || '').trim();
      if (collection === 'achievements') {
        entry.description = String(formData.get('description') || '').trim();
      }
    }

    const projectScreenshots =
      collection === 'projects' ? Array.from(screenshotInput?.files || []) : [];
    if (
      projectScreenshots.length > 5 ||
      projectScreenshots.some((file) => !file.type.startsWith('image/'))
    ) {
      setManagerStatus('Choose up to five valid image files for the project screenshots.', true);
      return;
    }

    if (collection === 'projects' && projectScreenshots.length > 0) {
      try {
        await saveProjectScreenshots(entry.id, projectScreenshots);
      } catch (error) {
        setManagerStatus(
          error.message || 'Could not save project screenshots in this browser.',
          true
        );
        return;
      }
    }

    const nextEntries = {
      ...portfolioEntries,
      [collection]: [...portfolioEntries[collection], entry]
    };
    if (!savePortfolioEntries(nextEntries)) {
      if (collection === 'projects' && projectScreenshots.length > 0) {
        try {
          await deleteProjectScreenshots(entry.id);
        } catch (error) {
          setManagerStatus(
            `The project could not be saved, and its screenshot cleanup failed: ${error.message}`,
            true
          );
        }
      }
      return;
    }

    portfolioEntries = nextEntries;
    renderPortfolioEntries();
    form.reset();
    if (screenshotNote) {
      screenshotNote.textContent =
        'Selected screenshots are saved in this browser and shown in the project gallery.';
      screenshotNote.dataset.error = 'false';
    }
    setManagerStatus(`${title} added to this browser's portfolio.`);
  });
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest('[data-delete-collection][data-delete-id]');
  if (!button || !portfolioStorageReady) return;

  const { deleteCollection: collection, deleteId: id } = button.dataset;
  if (
    !collection ||
    !id ||
    !['projects', 'skills', 'achievements', 'certificates'].includes(collection)
  ) {
    return;
  }

  const removedEntry = portfolioEntries[collection].find((entry) => entry.id === id);
  if (!removedEntry) return;

  const nextEntries = {
    ...portfolioEntries,
    [collection]: portfolioEntries[collection].filter((entry) => entry.id !== id)
  };
  if (!savePortfolioEntries(nextEntries)) return;

  portfolioEntries = nextEntries;
  renderPortfolioEntries();
  if (collection === 'projects') {
    deleteProjectScreenshots(id)
      .then(() => setManagerStatus(`${removedEntry.title} removed from this browser's portfolio.`))
      .catch((error) =>
        setManagerStatus(
          `The project was removed, but its screenshots could not be cleared: ${error.message}`,
          true
        )
      );
  } else {
    setManagerStatus(`${removedEntry.title} removed from this browser's portfolio.`);
  }
});
