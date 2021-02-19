var DEBUG = window.location.hostname == "local.minrk.net";
if (DEBUG) {
  var client_id = "339cf6a31b24852a37a1";
  var auth_host = "all-my-pulls-auth-debug.herokuapp.com";
} else {
  var client_id = "19277e98ad9400d0133b";
  var auth_host = "all-my-pulls-auth.herokuapp.com";
}

function getNextPage(linksHeader) {
  // from github.js Requestable.js
  var links = linksHeader.split(/\s*,\s*/); // splits and strips the urls

  return links.reduce(function (nextUrl, link) {
    if (link.search(/rel\s*=\s*"next"/) !== -1) {
      return (link.match(/<(.*)>/) || [])[1];
    }
    return nextUrl;
  }, undefined);
}

function shouldIncludeRepo(repo, inclusions, exclusions) {
  // check exclusions
  for (var exclusion, i = 0; i < exclusions.length; i++) {
    exclusion = exclusions[i];
    if (exclusion.indexOf("/") !== -1) {
      // repo exclusion
      if (repo.full_name === exclusion) return false;
    } else {
      // org exclusion
      if (repo.owner.login === exclusion) return false;
    }
  }

  // no inclusions to check, accept match
  if (inclusions.length === 0) return true;
  // check inclusions

  for (var inclusion, i = 0; i < inclusions.length; i++) {
    inclusion = inclusions[i];
    if (inclusion.indexOf("/") !== -1) {
      // repo inclusion
      if (repo.full_name === inclusion) return true;
    } else {
      // org inclusion
      if (repo.owner.login === inclusion) return true;
    }
  }
  return false;
}

var PullRequest = React.createClass({
  displayName: "PullRequest",
  render: function () {
    var pr = this.props.data;
    var updated = moment(pr.updated_at).fromNow();
    var created = moment(pr.created_at).fromNow();
    var milestone = pr.milestone && pr.milestone.title;

    var assigned;
    if (pr.assignedToMe) {
      assigned = (
        <span className="label label-success pull-right">
          assigned to {this.props.user.login}
        </span>
      );
    } else if (pr.assigned) {
      // var assignees = pr.assignees.map((u) => u.login).join(",");
      // Just one? If accepting multiples, should truncate
      assigned = (
        <span className="label label-default pull-right">
          assigned to {pr.assignees[0].login}
        </span>
      );
    } else {
      assigned = (
        <span className="label label-warning pull-right">unassigned</span>
      );
    }

    var review;
    if (pr.reviewFromMe) {
      review = (
        <span className="label label-danger pull-right">review requested</span>
      );
    } else if (pr.outstanding_reviewers.length > 0) {
      review = (
        <span className="label label-warning pull-right">
          awaiting review by {pr.outstanding_reviewers.join(",")}
        </span>
      );
    } else if (pr.reviewers.length > 0) {
      review = (
        <span className="label label-success pull-right">
          reviewed by {pr.reviewers.join(",")}
        </span>
      );
    } else {
      review = (
        <span className="label label-warning pull-right">no reviews</span>
      );
    }

    return (
      <div className="row">
        <div className="pull-request col-xs-12">
          <a href={pr.html_url} className="pr-link">
            <div className="pr-title-row">
              <span className="pr-repo-name">{pr.base.repo.full_name}</span>
              <span className="pr-title">{pr.title}</span>
              <span
                className={
                  pr.status === "success"
                    ? "label label-success"
                    : pr.status === "failure"
                    ? "label label-danger"
                    : pr.status === "pending"
                    ? "label label-warning"
                    : "label label-default"
                }
              >
                {pr.status}
              </span>
              {assigned}
              {review}
            </div>
            <div className="pr-subtitle">
              #{pr.number} opened {created} by @{pr.user.login} {milestone}
              <br />
              Updated {updated}
            </div>
          </a>
        </div>
      </div>
    );
  },
});

function prSortKey(pr, user) {
  // sort:
  // assigned to me
  // review requested of me
  // unassigned
  // assigned to someone else
  //
  var key = [];
  var assigned = pr.assignees.length > 0;
  var assignedToMe = pr.assignees.some((u) => u.id === user.id);
  var hasReviewers = pr.reviews.length + pr.requested_reviewers.length > 0;
  var reviewFromMe = pr.requested_reviewers.some((u) => u.id === user.id);
  return [
    pr.assignedToMe,
    pr.reviewFromMe,
    -pr.assigned,
    -hasReviewers,
    pr.updated_at,
  ];
}

var PullRequestList = React.createClass({
  displayName: "PullRequestList",
  getInitialState: function () {
    return {
      pulls: [],
      loadedRepos: {},
    };
  },
  componentDidMount: function () {
    this.fetchNewPulls(this.props);
  },
  componentWillReceiveProps: function (props) {
    // on updated props, update PRs
    this.fetchNewPulls(props);
  },
  render: function () {
    var that = this;

    var reposWithPulls = {};
    // apply exclusions
    var pulls = this.state.pulls.filter(function (pr_data) {
      var repo = pr_data.base.repo;
      var shouldInclude = shouldIncludeRepo(
        repo,
        that.props.inclusions,
        that.props.exclusions
      );
      reposWithPulls[repo.full_name] = shouldInclude;
      return shouldInclude;
    });

    var prNodes = pulls.map(function (pr_data) {
      return (
        <PullRequest
          key={pr_data.id}
          data={pr_data}
          github={github}
          user={that.props.user}
        />
      );
    });
    // sort by
    // 2. review requested of me
    // 1. assigned to me
    updated: prNodes.sort(function (prA, prB) {
      var aKey = prSortKey(prA.props.data, that.props.user);
      var bKey = prSortKey(prB.props.data, that.props.user);
      for (var i = 0; i < aKey.length; i += 1) {
        var a = aKey[i];
        var b = bKey[i];
        if (a > b) return -1;
        if (b > a) return 1;
      }
      return 0;
    });

    return (
      <div className="prList">
        <div className="">
          {pulls.length} pull requests in {Object.keys(reposWithPulls).length}{" "}
          repos
        </div>
        {prNodes}
      </div>
    );
  },
  fetchNewPulls: function (props) {
    // fetch PRs for repos we haven't seen before
    var that = this;
    props.repos.map(function (repo) {
      if (
        !that.state.loadedRepos[repo.full_name] &&
        shouldIncludeRepo(repo, props.inclusions, props.exclusions)
      ) {
        console.log("fetching pulls for", repo.full_name);
        that.loadPulls(repo);
      }
    });
  },
  loadPulls: function (repo) {
    // load pull-requests for a single repo
    var that = this;
    var closure = {};
    this.state.loadedRepos[repo.full_name] = true;
    console.log("Loading pulls for", repo.full_name);
    this.props.github
      .getRepo(repo.full_name)
      .listPullRequests()
      .then(function (resp) {
        var pulls = (closure.pulls = resp.data);

        var requests = [];
        // todo: include check-runs?
        function getPRStatus(pr) {
          return that.props.github
            .getRepo(repo.full_name)
            .listStatuses(pr.head.sha)
            .then(function (resp) {
              var statuses = resp.data || [];
              pr.status =
                statuses.length === 0
                  ? "none"
                  : statuses[0].state === "success"
                  ? "success"
                  : statuses.some((elem) => elem.state === "failure")
                  ? "failure"
                  : statuses.some((elem) => elem.state === "pending") ||
                    statuses.length === 0
                  ? "pending"
                  : "unknown";
            });
        }
        function getPRReviews(pr) {
          // load reviews from reviews API
          return that.props.github
            .getRepo(repo.full_name)
            ._request(
              "GET",
              `/repos/${repo.full_name}/pulls/${pr.number}/reviews`
            )
            .then(function (resp) {
              var reviews = resp.data || [];
              pr.reviews = reviews;
              var requested_reviewers = pr.requested_reviewers.map(
                (reviewer) => reviewer.login
              );
              pr.reviewers = [
                ...new Set(pr.reviews.map((review) => review.user.login)),
              ];
              pr.outstanding_reviewers = requested_reviewers.filter((name) => {
                pr.reviewers.indexOf(name) < 0;
              });
              pr.reviewFromMe = pr.requested_reviewers.some(
                (u) => u.id === that.props.user.id
              );
            });
        }
        for (var i = 0; i < closure.pulls.length; i++) {
          var pr = closure.pulls[i];
          pr.assigned = pr.assignees.length > 0;
          pr.assignedToMe = pr.assignees.some(
            (u) => u.id === that.props.user.id
          );

          requests.push(getPRStatus(pr));
          requests.push(getPRReviews(pr));
        }
        return Promise.all(requests);
      })

      .then(function () {
        that.setState({
          pulls: that.state.pulls.concat(closure.pulls),
        });
      });
  },
});

var User = React.createClass({
  displayName: "User",
  getInitialState: function () {
    var exclusions = ["my-org", "my-org/repo", "conda-forge/staged-recipes"];
    if (localStorage.all_my_pulls_exclusions) {
      try {
        exclusions = JSON.parse(localStorage.all_my_pulls_exclusions);
      } catch (e) {
        console.error("Failed to load exclusions from localStorage");
      }
    }
    var inclusions = [];
    if (localStorage.all_my_pulls_inclusions) {
      try {
        inclusions = JSON.parse(localStorage.all_my_pulls_inclusions);
      } catch (e) {
        console.error("Failed to load inclusions from localStorage");
      }
    }
    return {
      repos: [],
      profile: {},
      exclusions: exclusions,
      inclusions: inclusions,
    };
  },
  componentDidMount: function () {
    this.loadProfile();
    this.loadRepos();
  },
  render: function () {
    return (
      <div className="user">
        <h2 className="text-center">
          Showing all GitHub pull requests mergeable by
          <span className="username"> @{this.state.profile.login}</span>
        </h2>
        Only include these orgs/repos:
        <ReactTagsInput
          value={this.state.inclusions}
          onChange={this.handleInclusionsChange}
        />
        orgs/repos to <i>exclude</i>:
        <ReactTagsInput
          value={this.state.exclusions}
          onChange={this.handleExclusionsChange}
        />
        <PullRequestList
          user={this.state.profile}
          repos={this.state.repos}
          inclusions={this.state.inclusions}
          exclusions={this.state.exclusions}
          github={github}
        />
      </div>
    );
  },
  handleExclusionsChange: function (value) {
    this.setState({ exclusions: value });
    localStorage.all_my_pulls_exclusions = JSON.stringify(value);
  },
  handleInclusionsChange: function (value) {
    this.setState({ inclusions: value });
    localStorage.all_my_pulls_inclusions = JSON.stringify(value);
  },
  loadProfile: function () {
    var that = this;
    this.props.user.getProfile().then(function (profile) {
      that.setState({
        profile: profile.data,
      });
    });
  },
  loadRepos: function () {
    var that = this;
    // use paged request to load data piecemeal
    // this is based on github.js _requestAllPages
    var user = this.props.user;
    function handleMoreRepos(resp) {
      if (resp.headers.link !== undefined) {
        var nextUrl = getNextPage(resp.headers.link);
        if (nextUrl) {
          user._request("GET", nextUrl).then(handleMoreRepos);
        }
      }
      // filter out repos we can't push to and don't have open issues
      var new_repos = resp.data.filter(function (repo) {
        // exclude repos I can't push to
        // it doesn't seem like these should show up in this list, but some org repos do
        if (!repo.permissions.push) return false;
        // exclude repos with no issues
        if (repo.open_issues_count === 0) return false;
        // exclude repos not updated in 2 years,
        // to limit wasted API calls
        var updated = new Date(repo.updated_at);
        var today = new Date();
        var years_ago = (today - updated) / 31556926000;
        if (years_ago > 2) return false;
        return true;
      });
      that.setState({
        repos: that.state.repos.concat(new_repos),
      });
    }
    user
      ._request("GET", "/user/repos", { sort: "updated" })
      .then(handleMoreRepos);
  },
});

var RateLimit = React.createClass({
  displayName: "RateLimit",
  render: function () {
    var reset_date = new Date(this.props.data.rate.reset * 1000);
    return (
      <h2 className="rate-limit-error text-center">
        GitHub API Rate limit exceeded! Try again {moment(reset_date).fromNow()}
        .
      </h2>
    );
  },
});

var code_match = window.location.search.match(/[\?&]code=([^&]+)/);
if (!code_match) {
  window.location =
    "https://github.com/login/oauth/authorize?scope=read:org&client_id=" +
    client_id +
    "&redirect_uri=" +
    window.location;
} else {
  var code = code_match[1];
  // scrub OAuth code from URL
  window.history.replaceState(
    "not sure",
    "All My Pulls",
    window.location.pathname
  );

  // request OAuth token
  $.getJSON("https://" + auth_host + "/authenticate/" + code, function (data) {
    // check response
    if (!data.token) {
      console.error("Failed to login with GitHub, code:", code);
      console.error("Response:", data);
      alert("Failed to login with GitHub: " + JSON.stringify(data));
      return;
    }
    // create GitHub client
    var github = (window.github = new GitHub({
      token: data.token,
    }));

    // check rateLimit, then proceed
    github
      .getRateLimit()
      .getRateLimit()
      .then(function (resp) {
        console.log("API limit remaining: " + resp.data.rate.remaining);
        // date constructor takes epoch milliseconds and we get epoch seconds
        if (resp.data.rate.remaining === 0) {
          // don't burn the rate limit
          ReactDOM.render(
            <RateLimit data={resp.data} />,
            document.getElementById("content")
          );
          return;
        }

        var user = github.getUser();
        ReactDOM.render(
          <User github={github} user={user} data={data} />,
          document.getElementById("content")
        );
      })
      .catch(function (error) {
        console.log("Error fetching rate limit", error.message);
      });
  });
}
